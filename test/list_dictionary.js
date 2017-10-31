const _ = require('underscore');
const assert = require('chai').assert;
const listDict = require('../list_dictionary');


// asserts that linked list is equivalent to an array of [{key: Object, value: Object}] objects
const assertSame = function (ld, array) {
    assert.equal(ld.length(), array.length);
    assert.equal(_.keys(ld.dictionary).length, array.length);

    // iterate linked list forwards and check all invariants
    const list = ld.linkedList;
    let i = 0;
    for (let node = list.head; node !== null; node = node.next, i++) {
        assert.equal(node.data, array[i].value);
        assert.equal(ld.dictionary[array[i].key], node);
        assert.equal(node.data, array[i].value);
    }

    assert.equal(i, array.length);
};


describe('list_dictionary', () => {
    describe('#add()', () => {
        it('just works', () => {
            const ld = listDict.create();
            const array = [];

            // check invalid params
            assert.throws(() => { ld.add(null, 'val'); }, Error);
            assert.throws(() => { ld.add(123, 'val'); }, Error);
            assert.throws(() => { ld.add(true, 'val'); }, Error);
            assert.throws(() => { ld.add(false, 'val'); }, Error);
            assert.throws(() => { ld.add({}, 'val'); }, Error);
            assert.throws(() => { ld.add(null, null); }, Error);

            // add various new elements
            assert(ld.add('', 'empty'));
            array.push({ key: '', value: 'empty' });
            assertSame(ld, array);

            assert(ld.add('123', 'val123'));
            array.push({ key: '123', value: 'val123' });
            assertSame(ld, array);

            assert(ld.add('null', null));
            array.push({ key: 'null', value: null });
            assertSame(ld, array);

            assert(ld.add('undefined', undefined));
            array.push({ key: 'undefined', value: undefined });
            assertSame(ld, array);

            const obj = {};
            assert(ld.add('obj', obj));
            array.push({ key: 'obj', value: obj });
            assertSame(ld, array);

            assert(ld.add('true', 'valTrue', true));
            array.unshift({ key: 'true', value: 'valTrue' });
            assertSame(ld, array);

            assert(ld.add('123.456', 'val123.456', false));
            array.push({ key: '123.456', value: 'val123.456' });
            assertSame(ld, array);

            // add to back
            for (var i = 0; i < 50; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            // add to front
            for (var i = 50; i < 100; i++) {
                assert(ld.add(`key${i}`, `val${i}`, true));
                array.unshift({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            // add already added elements
            for (var i = 0; i < 100; i++) {
                assert(!ld.add(`key${i}`, `val${i}`));
                assertSame(ld, array);
            }
        });
    });


    describe('#get()', () => {
        it('just works', () => {
            const ld = listDict.create();
            const array = [];

            // check invalid params
            assert.throws(() => { ld.get(null); }, Error);
            assert.throws(() => { ld.get(123); }, Error);
            assert.throws(() => { ld.get(true); }, Error);
            assert.throws(() => { ld.get(false); }, Error);
            assert.throws(() => { ld.get({}); }, Error);

            assert(ld.add('', 'empty'));
            array.push({ key: '', value: 'empty' });
            assertSame(ld, array);

            assert(ld.add('null', null));
            array.push({ key: 'null', value: null });
            assertSame(ld, array);

            // add to back
            for (let i = 0; i < 50; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            // try get existing items
            assert.equal(ld.get('null'), null);
            assert.equal(ld.get(''), 'empty');
            const indexes = _.shuffle(_.range(50));
            indexes.forEach((i) => {
                assert.equal(ld.get(`key${i}`), `val${i}`, `index is ${i}`);
                assertSame(ld, array);
            });

            // try get non-existing items
            assert.equal(ld.get('key51'), null);
            assert.equal(ld.get('123'), null);
            assert.equal(ld.get('true'), null);
        });
    });


    describe('#remove()', () => {
        it('just works', () => {
            const ld = listDict.create();
            let array = [];

            // check invalid params
            assert.throws(() => { ld.remove(null); }, Error);
            assert.throws(() => { ld.remove(123); }, Error);
            assert.throws(() => { ld.remove(true); }, Error);
            assert.throws(() => { ld.remove(false); }, Error);
            assert.throws(() => { ld.remove({}); }, Error);

            assert(ld.add('', 'empty'));
            array.push({ key: '', value: 'empty' });
            assertSame(ld, array);

            assert(ld.add('null', null));
            array.push({ key: 'null', value: null });
            assertSame(ld, array);

            // add to back
            for (let i = 0; i < 50; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            // try remove all items
            assert.equal(ld.remove(''), 'empty');
            array = _.filter(array, (elem) => { return elem.key !== ''; });
            assertSame(ld, array);

            assert.equal(ld.remove('null'), null);
            array = _.filter(array, (elem) => { return elem.key !== 'null'; });
            assertSame(ld, array);

            // try remove non-existent items
            assert.equal(ld.remove('bla bla'), null);
            assertSame(ld, array);
            assert.equal(ld.remove(''), null);
            assertSame(ld, array);

            const indexes = _.shuffle(_.range(50));
            indexes.forEach((i) => {
                assert.equal(ld.remove(`key${i}`), `val${i}`);
                array = _.filter(array, (elem) => { return elem.key !== `key${i}`; });
                assertSame(ld, array);
            });

            assertSame(ld, []);
        });
    });


    describe('#getFirst() #removeFirst()', () => {
        it('just works', () => {
            const ld = listDict.create();
            const array = [];
            assertSame(ld, array);

            assert.equal(ld.getFirst(), null);
            assertSame(ld, array);

            for (let i = 0; i < 10; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            while (ld.length() > 0) {
                assert.equal(ld.getFirst(), array[0].value);
                assertSame(ld, array);

                assert.equal(ld.removeFirst(), array.shift().value);
                assertSame(ld, array);
            }

            assert.equal(ld.getFirst(), null);
            assertSame(ld, array);

            assert.equal(ld.removeFirst(), null);
            assertSame(ld, array);
        });
    });


    describe('#moveFirstToEnd()', () => {
        it('just works', () => {
            const ld = listDict.create();
            const array = [];

            assert.equal(ld.moveFirstToEnd(), null);
            assertSame(ld, array);

            // add to back
            for (let i = 0; i < 50; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            // try move 1
            assert.equal(ld.moveFirstToEnd(), 'val0');
            array.push(array[0]);
            array.shift();
            assertSame(ld, array);

            // try move 2
            assert.equal(ld.moveFirstToEnd(), 'val1');
            array.push(array[0]);
            array.shift();
            assertSame(ld, array);
        });
    });


    describe('#clear()', () => {
        it('just works', () => {
            const ld = listDict.create();
            let array = [];

            // add few elements
            for (let i = 0; i < 50; i++) {
                assert(ld.add(`key${i}`, `val${i}`));
                array.push({ key: `key${i}`, value: `val${i}` });
                assertSame(ld, array);
            }

            ld.clear();
            array = [];
            assertSame(ld, array);

            ld.clear();
            array = [];
            assertSame(ld, array);
        });
    });
});
