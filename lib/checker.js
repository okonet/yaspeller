var async = require('async'),
    utils = require('./utils'),
    plugins = [
        require('./checker/yandex-speller'),
        require('./checker/eyo')
    ];

function mergeResults(res) {
    var err = false,
        data = [];

    res.some(function(el) {
        if(el[0]) {
            err = true;
            data = el[1];
            return true;
        }

        return false;
    });

    if(!err) {
        res.forEach(function(el) {
            data = data.concat(el[1]);
        });
    }

    return {
        err: err,
        data: data
    };
}

module.exports = {
    check: function(text, callback, settings) {
        var tasks = [];
        plugins.forEach(function(plugin) {
              tasks.push(function(cb) {
                  plugin.check(text, function(err, data) {
                      cb(null, [err, data]);
                  }, settings);
              });
        });

        async.parallelLimit(tasks, utils.getMaxRequest(settings), function(err, data) {
            var buffer = [];
            data.forEach(function(el) {
                buffer.push(el[1]);
            });

            var result = mergeResults(buffer);
            callback(result.err, result.data);
        });
    }
};
