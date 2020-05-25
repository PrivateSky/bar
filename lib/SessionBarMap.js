'use strict';

function SessionBarMap(options) {
    options = options || {};

    let sessionBarMap = options.sessionBarMap;
    let diffBarMap = options.diffBarMap;

    const initialize = () => {
        const barMapProperties = Object.getOwnPropertyNames(sessionBarMap);

        for (const property of barMapProperties) {
            if (typeof sessionBarMap[property] !== 'function') {
                continue;
            }

            createProxyMethod(property);
        }
    }


    /**
     * Create a proxy method for BarMap::{method}
     *
     * If a BarMapController has a method named ${method}ProxyHandler exists
     * the call to BarMap::{method} is redirected to
     * BarMapController::{method}ProxyHandler
     *
     * @param {string} method
     * @return {Proxy}
     */
    const createProxyMethod = (method) => {
        const proxy = new Proxy(function () {}, {
            apply: (target, thisArg, argumentsList) => {
                const targetHandlerName = `${method}ProxyHandler`;

                if (typeof this[targetHandlerName] === 'function') {
                    return this[targetHandlerName](...argumentsList);
                }
                return sessionBarMap[method].apply(sessionBarMap, argumentsList);
            }
        })

        this[method] = proxy;
    }

    this.addFileEntryProxyHandler = (path, bricks) => {
        diffBarMap.addFileEntry(path, bricks);
        sessionBarMap.addFileEntry(path, bricks);
    }

    this.appendBricksToFileProxyHandler = (path, bricks) => {
        diffBarMap.addFileEntry(path, bricks);
        sessionBarMap.addFileEntry(path, bricks);
    }

    this.deleteProxyHandler = (path) => {
        diffBarMap.delete(path, true);
        sessionBarMap.delete(path);
    }

    this.getDiff = () => {
        return diffBarMap;
    }

    this.getBarMap = () => {
        return sessionBarMap;
    }

    initialize();
}

module.exports = SessionBarMap;
