/* jshint maxlen: 300 */
var async = require('async'),
    entities = require('entities'),
    fs = require('fs'),
    isutf8 = require('isutf8'),
    request = require('request'),
    pth = require('path'),
    showdown = require('showdown'),
    xml2js = require('xml2js'),
    _ = require('lodash'),
    formatModule = require('./format'),
    ignore = require('./ignore'),
    checker = require('./checker'),
    utils = require('./utils'),
    markdownConverter = new showdown.Converter(),
    printDebug = require('./debug').print;

function prepareText(text, format) {
    return text.replace(/\r\n/g, '\n') // Fix Windows
        .replace(/\r/g, '\n') // Fix MacOS
        .replace(/\s+\n/g, '\n') // Trailling spaces
        .replace(/\s+/g, ' ') // Repeat spaces
        .replace(/\n+/g, '\n') // Repeat line ends
        .trim();
}

function stripTags(html) {
    return html.replace(/<\/?[a-z][^>]*>/gi, ' ');
}

/**
 * Check text for typos.
 *
 * @param {string} text
 * @param {Function} callback
 * @param {Object} [mainSettings]
 */
function checkText(text, callback, mainSettings) {
    mainSettings = mainSettings || {};

    var settings = {
        options: mainSettings.options
    };

    settings.format = formatModule.getFormat(text, mainSettings);

    settings.lang = mainSettings.lang || 'en,ru';
    if(typeof mainSettings.lang === 'string') {
        settings.lang = mainSettings.lang.split(',');
    }

    if(ignore.hasIgnoredText(text)) {
        text = ignore.lines(text);
        text = ignore.blocks(text);
    }

    if(settings.format === 'html' || settings.format === 'markdown') {
        if(settings.format === 'markdown') {
            text = markdownConverter.makeHtml(text);
        }

        if(settings.ignoreTags) {
            text = ignore.tags(text, settings.ignoreTags);
        }

        text = ignore.comments(text);
        text = stripTags(text);
        text = entities.decodeHTML(text);
    }

    text = prepareText(text, settings.format);

    checker.check(text, callback, settings);
}

/**
 * Check text in file on typos.
 *
 * @param {string} file
 * @param {Function} callback
 * @param {Object} [settings] See {@tutorial options}
 */
function checkFile(file, callback, settings) {
    settings = settings || {};
    settings.extname = pth.extname(file);

    printDebug('get: ' + file);

    if(fs.existsSync(file)) {
        if(fs.statSync(file).isFile()) {
            var buf = fs.readFileSync(file);
            if(isutf8(buf)) {
                printDebug('post text -> Yandex.Speller API: ' + file);

                var startTime = Date.now();
                checkText(buf.toString(), function(err, data) {
                    callback(err, err ? data : {resource: file, data: data, time: Date.now() - startTime});
                }, settings);
            } else {
                callback(true, Error(file + ': is not utf-8'));
            }
        } else {
            callback(true, Error(file + ': is not file'));
        }
    } else {
        callback(true, Error(file + ': is not exists'));
    }
}

/**
 * Check text on link for typos.
 *
 * @param {string} url
 * @param {Function} callback
 * @param {Object} [settings] See {@tutorial settings}
 */
function checkUrl(url, callback, settings) {
    settings = settings || {};
    settings.extname = pth.extname(url);

    printDebug('get: ' + url);

    request.get({
            method: 'GET',
            uri: url,
            gzip: true
        },
        function(error, response, text) {
            if(error) {
                callback(true, error);
                return;
            }

            if(response.statusCode !== 200) {
                callback(true, Error(url + ': returns status code is ' + response.statusCode));
                return;
            }

            var startTime = Date.now();
            checkText(text, function(err, data) {
                callback(err, err ? data : {resource: url, data: data, time: Date.now() - startTime});
            }, settings);
    });
}

/**
 * Check text on pages of sitemap.xml.
 *
 * @param {string} url
 * @param {Function} commonCallback - Common callback
 * @param {Object} [settings] See {@tutorial settings}
 * @param {Function} [callback] callback - Callback on each url.
 */
function checkSitemap(url, commonCallback, settings, callback) {
    settings = settings || {};

    var results = [];

    printDebug('get: ' + url);

    request.get(url, function(error, response, xml) {
        var obj;

        if(error) {
            obj = [true, error];
            results.push(obj);
            callback && callback.apply(this, obj);
            commonCallback(results);

            return;
        }

        if(response.statusCode !== 200) {
            obj = [true, Error(url + ': returns status code is ' + response.statusCode)];
            results.push(obj);
            callback && callback.apply(this, obj);
            commonCallback(results);

            return;
        }

        var parser = new xml2js.Parser();
        parser.parseString(xml, function(err, result) {
            if(err) {
                var obj = [true, Error(url + ': error parsing xml')];
                results.push(obj);
                callback && callback.apply(this, obj);
                commonCallback(results);
                return;
            }

            var tasks = [];
            if(result && result.urlset && Array.isArray(result.urlset.url)) {
                result.urlset.url.forEach(function(el) {
                    el.loc && el.loc.forEach(function(url) {
                        tasks.push(function(cb) {
                            checkUrl(url, function(err, data) {
                                callback && callback(err, data);
                                cb(false, [err, data]);
                            }, settings);
                        });
                    });
                });
            }

            async.parallelLimit(tasks, utils.getMaxRequest(settings), function(err, data) {
                commonCallback(data);
            });
        });
    });
}

/**
 * Remove duplicates in typos.
 *
 * @param {Object[]} data - Array of typos.
 * @return {Object[]}
 */
function removeDuplicates(data) {
    var result = [],
        obj = {};

    data.forEach(function(el) {
        var code = el.code,
            word = el.word,
            s = el.s;

        if(!word) {
            result.push(el);
            return;
        }

        obj[code] = obj[code] || {};

        if(!obj[code][word]) {
            obj[code][word] = {
                code: code,
                word: word,
                count: el.count || 0
            };

            if(Array.isArray(s) && s.length) {
                obj[code][word].suggest = s;
            }
        }

        obj[code][word].count++;
    });

    Object.keys(obj).forEach(function(code) {
        Object.keys(obj[code]).sort(function(a, b) {
            return a > b ? 1 : -1;
        }).forEach(function(word) {
            result.push(obj[code][word]);
        });
    });

    return result;
}

module.exports = {
    checkFile: checkFile,
    checkSitemap: checkSitemap,
    checkText: checkText,
    checkUrl: checkUrl,
    removeDuplicates: removeDuplicates
};
