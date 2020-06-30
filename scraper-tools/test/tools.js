const { expect } = require('chai');
const Apify = require('apify');

const tools = require('../src/tools');
const { META_KEY } = require('../src/consts');

describe('tools.', () => {
    describe('ensureMetaData()', () => {
        it('should work', () => {
            const request = new Apify.Request({ url: 'https://www.example.com' });
            tools.ensureMetaData(request);

            expect(request.userData[META_KEY]).to.be.an('object');
            const meta = request.userData[META_KEY];
            expect(meta.depth).to.be.eql(0);
            expect(meta.parentRequestId).to.be.eql(null);
        });
    });
});
