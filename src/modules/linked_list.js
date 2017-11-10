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

export default class LinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
        this.length = 0;
    }

    /**
     * Returns length of the list.
     */
    getLength() {
        return this.length;
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
     * Removes given node from the list.
     */
    removeNode(node) {
        if (!(node instanceof LinkedListNode)) throw new Error('Parameter "node" must be an instance of LinkedListNode!');

        // Some predecessor
        if (node.prev !== null) {
            // Some successor
            if (node.next !== null) {
                node.prev.next = node.next;
                node.next.prev = node.prev;
                node.prev = null;
                node.next = null;
            // No successor
            } else {
                this.tail = node.prev;
                node.prev.next = null;
                node.prev = null;
            }
        // No predecessor, some successor
        } else if (node.next !== null) {
            this.head = node.next;
            node.next.prev = null;
            node.next = null;
        // No predecessor, nor successor
        } else {
            this.head = null;
            this.tail = null;
            node.next = null;
            node.prev = null;
        }

        this.length --;
    }

    /**
     * Returns the first item from the list. The function returns the item object or null if the list is empty.
     */
    getFirstNode() {
        return this.head;
    }
}

