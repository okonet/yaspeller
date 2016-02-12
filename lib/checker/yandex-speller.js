/* jshint maxlen: 300 */
var async = require('async'),
    _ = require('lodash'),
    yandexSpeller = require('yandex-speller'),
    utils = require('../utils'),
    printDebug = require('../debug').print,
    MAX_LEN_TEXT = 10000; // Max length of text for Yandex.Speller API

/**
 * Get API format.
 *
 * @param {string} format
 * @return {string}
 */
function getApiFormat(format) {
    return format === 'html' || format === 'markdown' ? 'html' : 'plain';
}

/**
 * Split text.
 *
 * @param {string} text
 * @return {Array}
 */
function splitText(text) {
    var texts = [],
        pos = 0,
        newPos = 0;

    while(pos < text.length) {
        if(pos + MAX_LEN_TEXT >= text.length) {
            texts.push(text.substring(pos));
            break;
        } else {
            newPos = getPosition(text, pos + MAX_LEN_TEXT);
            texts.push(text.substring(pos, newPos));
            pos = newPos;
        }
    }

    return texts;
}

function getPosition(text, start) {
    var depth = 500; // MAX_LEN_TEXT / 20
    for(var i = start - 1; i >= start - depth; i--) {
        var sym = text[i];
        if(sym === ' ' || sym === '\n' || sym === '\t') {
            return i;
        }
    }

    return start;
}

/*
            code: 1, // ERROR_UNKNOWN_WORD
            title: 'Typos'
            code: 2, // ERROR_REPEAT_WORD
            title: 'Repeat words'
        }, {
            code: 3, // ERROR_CAPITALIZATION
            title: 'Capitalization'
        }
    ]
*/

module.exports = {
    name: 'yandex-speller',
    lang: ['ru', 'uk', 'en'],
    format: ['plain', 'html', 'markdown'],
    check: function(text, callback, settings) {
        var data = [],
          apiFormat = getApiFormat(settings.format);
          apiSettings = {
              format: apiFormat,
              lang: settings.lang.join(','),
              options: settings.options
          },
          tasks = [];

        splitText(text).forEach(function(el, i) {
            printDebug({
                request: i,
                format: settings.format,
                apiFormat: apiFormat,
                lang: settings.lang,
                options: settings.options,
                text: _.trunc(el, 128)
            });

            tasks.push(function(cb) {
                yandexSpeller.checkText(text, function(err, data) {
                    cb(null, [err, data]);
                }, apiSettings);
            });
        });

        async.parallelLimit(tasks, utils.getMaxRequest(settings), function(err, data) {
            callback(null, data);
        });
    }
};
