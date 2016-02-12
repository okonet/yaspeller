var eyo = require('eyo-kernel');

module.exports = {
    name: 'eyo',
    description: 'Letter Ё (Yo)',
    lang: ['ru'],
    format: ['plain', 'html', 'markdown'],
    check: function(text, callback, settings) {
        var data = [];
        if(settings.checkEyo) {
            eyo.lint(text, true).safe.forEach(function(el) {
                data.push({
                    code: 100,
                    word: el.before,
                    s: [el.after],
                    count: el.count
                });
            });
        }

        callback(null, [null, data.length ? data : null]);
    }
};
