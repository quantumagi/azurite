'use strict';

const env = require('./env'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra"));

const CONTAINERS_COL_NAME = 'Containers';

class StorageManager {
    constructor() {
        this.dbName = '__azurite_db__.json'
    }

    init(localStoragePath) {
        this.dbPath = path.join(localStoragePath, this.dbName);
        this.db = BbPromise.promisifyAll(new Loki(this.dbPath));
        return fs.statAsync(this.dbPath)
            .then((stat) => {
                return this.db.loadDatabaseAsync(this.dbName);
            })
            .then((data) => {
                if (!this.db.getCollection(CONTAINERS_COL_NAME)) {
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    return this.db.saveDatabaseAsync();
                }
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB hasn't been persisted / initialized yet.
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    return this.db.saveDatabaseAsync();
                }
                // This should never happen!
                console.error(`Failed to initialize database at "${this.dbPath}"`);
                throw e;
            });
    }

    createContainer(model) {
        let p = path.join(env.localStoragePath, model.name);
        return fs.mkdirAsync(p)
            .then(() => {
                let tables = this.db.getCollection(CONTAINERS_COL_NAME);
                tables.insert({ name: model.name, http_props: model.httpProps, meta_props:model.metaProps, access: model.access });
                return this.db.saveDatabaseAsync();
            });
    }

    deleteContainer(name) {
        let container = path.join(env.localStoragePath, name);
        return fs.statAsync(container)
            .then((stat) => {
                return fs.removeAsync(container);
            })
            .then(() => {
                let tables = this.db.getCollection(CONTAINERS_COL_NAME);
                tables.chain().find({ 'name': { '$eq': name } }).remove();
                // TODO: Delete all blobs stored in the container
                return this.db.saveDatabaseAsync();
            });
    }

    listContainer(prefix, maxresults) {
        return BbPromise.try(() => {
            maxresults = parseInt(maxresults);
            let tables = this.db.getCollection(CONTAINERS_COL_NAME);
            let result = tables.chain()
                .find({ 'name': { '$contains': prefix } })
                .simplesort('name')
                .limit(maxresults)
                .data();
            return result;
        });
    }

    createBlockBlob(container, blob, body, httpProps, metaProps, content) {
        let containerPath = path.join(env.localStoragePath, container);
        let blobPath = path.join(containerPath, blob);
        
        return fs.statAsync(containerPath)
            .then((stat) => {
                // Container exists, otherwise fs.statAsync throws error
                return fs.outputFileAsync(blobPath, body, { encoding: httpProps['Content-Encoding'] });
            })
            .then(() => {
                let coll = this.db.getCollection(container); 
                if (!coll) {
                    coll = this.db.addCollection(container);
                }

                coll.insert({
                    name: blob,
                    http_props: httpProps,
                    meta_props: metaProps
                });
                return this.db.saveDatabaseAsync();
            });
    }
}

module.exports = new StorageManager;