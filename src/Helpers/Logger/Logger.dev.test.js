const assert = require('assert');

// set debug to true for logger enviroment test
process.env.DEBUG = "true";
const Logger = require('../Logger.js');

describe('#Logger', () => {
    it('trace function available', () => {
        expect(Logger).toHaveProperty('trace');
    });
    it('debug function available', () => {
        expect(Logger).toHaveProperty('debug');
    });
    it('info function available', () => {
        expect(Logger).toHaveProperty('info');
    });
    it('warn function available', () => {
        expect(Logger).toHaveProperty('warn');
    });
    it('error function available', () => {
        expect(Logger).toHaveProperty('error');
    });
});

