
var _          = require('underscore');
var assert     = require('chai').assert;
var linkedList = require('../linked_list');

// asserts that linked list is equivalent to an array
var assertSame = function( list, array ) {

    assert.equal( list.length, array.length );

    // iterate list forwards
    var i=0;
    for( var node = list.head; node !== null; node = node.next, i++ )
        assert.equal( node.data, array[i] );
    assert.equal( i, array.length );

    // iterate list backwards
    i = array.length-1;
    for( var node = list.tail; node !== null; node = node.prev, i-- )
        assert.equal( node.data, array[i] );
    assert.equal( i, -1 );
};


describe('linked_list', function() {
    describe('#add()', function() {
        it('just works', function() {
            var list = linkedList.create();
            var array = [];
            assertSame( list, array );

            for( var i = 0; i < 10; i++ ) {
                list.add( i );
                array.push( i );
                assertSame( list, array );
            }

            for( var i = 10; i < 20; i++ ) {
                list.add( i, true );
                array.unshift( i );
                assertSame( list, array );
            }

            list.add( null );
            array.push( null );
            assertSame( list, array );

            list.add( undefined );
            array.push( undefined );
            assertSame( list, array );
        });
    });

    describe('#addNode()', function() {
        it('just works', function() {
            var list = linkedList.create();
            var array = [];
            assertSame( list, array );

            list.addNode({data: "test1"});
            array.push("test1");
            assertSame( list, array );

            list.addNode({data: "test2"}, true);
            array.unshift("test2");
            assertSame( list, array );

            list.addNode({data: "test3"}, false);
            array.push("test3");
            assertSame( list, array );

            list.addNode({data: "test4"}, true);
            array.unshift("test4");
            assertSame( list, array );

            // check invalid params
            assert.throws(function() { list.addNode(null); }, Error);
            assert.throws(function() { list.addNode(undefined); }, Error);
            assert.throws(function() { list.addNode("blabla"); }, Error);
            assert.throws(function() { list.addNode(123); }, Error);
            assert.throws(function() { list.addNode(true); }, Error);
            assert.throws(function() { list.addNode(false); }, Error);
            assert.throws(function() { list.addNode({prev: {}}); }, Error);
            assert.throws(function() { list.addNode({next: {}}); }, Error);
        });
    });


    describe('#find()', function() {
        it( 'just works', function() {
            var list = linkedList.create();
            var obj = {};
            var objWithEquals = {equals: function(other) { return !!other && other.xxx; }};
            list.add( 123 );
            list.add( "test" );
            list.add( 0.123 );
            list.add( true );
            list.add( null );
            list.add( obj );
            list.add( objWithEquals );

            assert( list.find(123).data === 123 );
            assert( list.find("test").data === "test" );
            assert( list.find(0.123).data === 0.123 );
            assert( list.find(true).data === true );
            assert( list.find(null).data === null );
            assert( list.find(obj).data === obj );
            assert( list.find({xxx: true}).data === objWithEquals );

            assert.equal( list.find(-123), null );
            assert.equal( list.find("testx"), null );
            assert.equal( list.find(0.456), null );
            assert.equal( list.find(false), null );
            assert.equal( list.find(undefined), null );
        });
    });


    describe('#removeNode()', function() {
        it('just works', function() {
            var list = linkedList.create();
            var array = [];
            assertSame( list, array );

            // add testing items
            for( var i = 0; i < 100; i++ ) {
                list.add( i );
                array.push( i );
                assertSame( list, array );
            }

            // remove selected items
            [33,0,99,45,15].forEach( function(val) {
                list.removeNode( list.find(val) );
                array = _.filter( array, function(i) { return i!==val; });
                assertSame( list, array );
            });

            // remove all items
            while( list.length > 0 ) {
                assert.equal( list.removeFirst(), array.shift() );
                assertSame( list, array );
            }

            assert.equal( list.removeFirst(), null );
            assertSame( list, [] );

            // check invalid params
            assert.throws(function() { list.removeNode(null); }, Error);
            assert.throws(function() { list.removeNode(undefined); }, Error);
            assert.throws(function() { list.removeNode(true); }, Error);
            assert.throws(function() { list.removeNode(false); }, Error);
            assert.throws(function() { list.removeNode(""); }, Error);

        });
    });


});


