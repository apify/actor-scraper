/**
 * This module defines the LinkedList class, which represents a doubly-linked list data structure.
 *
 * Author: Jan Curn (jan@apifier.com)
 * Copyright(c) 2014 Apifier. All rights reserved.
 */

class LinkedListNode {
    constructor(data) {
        this.prev = null;
        this.next = null;
        this.data = data;
    }
}

/**
 * A helper function to determine whether two data objects are equal.
 * The function attempts to do so using data1's function 'equal(data)' if there is one,
 * otherwise it uses '==' operator.
 */
const dataEqual = (data1, data2) => {
    if (data1 === null) return data2 === null;
    if (data1.equals) return data1.equals(data2);

    return data1 === data2;
};

export default class LinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
        this.length = 0;
    }

    /**
     * Appends a new node with specific data to the end of the linked list.
     */
    add(data, toFirstPosition) {
        const node = new LinkedListNode(data);
        this.addNode(node, toFirstPosition);

        return node;
    }

    /**
     * Appends a new node to the end of the linked list or the beginning if firstPosition is true-ish.
     */
    addNode(node, toFirstPosition) {
        if (!(node instanceof LinkedListNode)) throw new Error('Parameter "node" must be an instance of LinkedListNode!');
        if (node.prev || node.next) throw new Error('New node is still included in some linked list!');

        // Ensure they are null and not undefined!
        node.prev = null;
        node.next = null;

        if (this.length === 0) {
            this.tail = node;
            this.head = node;
        } else if (toFirstPosition) {
            node.next = this.head;
            this.head.prev = node;
            this.head = node;
        } else { // last position
            node.prev = this.tail;
            this.tail.next = node;
            this.tail = node;
        }

        this.length++;
    }

    /**
     * Finds a first node that holds a specific data object. See 'dataEqual' function for a description
     * how the object equality is tested. Function returns null if the data cannot be found.
     */
    find(data) {
        for (let node = this.head; node !== null; node = node.next) {
            if (dataEqual(node.data, data)) return node;
        }

        return null;
    }

    /**
     * Removes given node from the list.
     */
    removeNode(node) {
        if (!(node instanceof LinkedListNode)) throw new Error('Parameter "node" must be an instance of LinkedListNode!');

        // some predecessor
        if (node.prev !== null) {
            // some successor
            if (node.next !== null) {
                node.prev.next = node.next;
                node.next.prev = node.prev;
                node.prev = null;
                node.next = null;
            // no successor
            } else {
                this.tail = node.prev;
                node.prev.next = null;
                node.prev = null;
            }
        // no predecessor, some successor
        } else if (node.next !== null) {
            this.head = node.next;
            node.next.prev = null;
            node.next = null;
        // no predecessor, nor successor
        } else {
            this.head = null;
            this.tail = null;
            node.next = null;
            node.prev = null;
        }

        this.length--;
    }

    /**
     * Removes the first item from the list. The function
     * returns the item object or null if the list is empty.
     */
    removeFirst() {
        const head = this.head;
        if (!head) return null;
        this.removeNode(head);

        return head.data;
    }

    /**
     * Returns the first item from the list. The function
     * returns the item object or null if the list is empty.
     */
    getFirst() {
        return this.head;
    }
}

