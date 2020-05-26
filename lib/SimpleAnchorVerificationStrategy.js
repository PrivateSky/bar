'use strict';

// @TODO: remove this after switching to psk-key-did-resolver
function SimpleAnchorVerificationStrategy(options) {
    options = options || {};

    let barMapController;
    let sessionBarMap = null;

    this.setBarMapController = (controller) => {
        barMapController = controller;
    }

    this.beginSession = () => {
        sessionBarMap = barMapController.createSessionBarMap();
        return sessionBarMap;
    }

    this.sessionIsStarted = () => {
        return sessionBarMap !== null;
    }

    this.endSession = () => {
        sessionBarMap = null;
    }

    this.validatePreWrite = (operation, path, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback();
    }

    this.afterBarMapUpdate = (diff, callback) => {
        callback();
    }

    /**
     * Anchor each change
     * @param {callback} callback
     */
    this.doAnchoring = (callback) => {
        barMapController.saveSession(sessionBarMap, (err, hash) => {
            if (err) {
                return callback(err);
            }

            this.afterBarMapUpdate(sessionBarMap.getDiff(), (err) => {
                if (err) {
                    return callback(err);
                }
                this.endSession();
                callback(undefined, hash);
            })

        })
    }
}

module.exports = SimpleAnchorVerificationStrategy;
