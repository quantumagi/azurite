'use strict';

const StorageItem = require('./StorageItem');

class Container extends StorageItem {
    constructor(name, httpHeader) {
        super(name, httpHeader);
        this.access = httpHeader['x-ms-blob-public-access'] || 'private';
    }
}

module.exports = Container;