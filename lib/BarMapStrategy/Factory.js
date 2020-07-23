'use strict';

const DiffStrategy = require('./DiffStrategy');

/**
 * @param {object} options
 */
function Factory(options) {
    options = options || {};

    const factories = {};

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    const initialize = () => {
        const builtinStrategies = require("./bultinBarMapStrategies");
        this.registerStrategy(builtinStrategies.DIFF, this.createDiffStrategy);
    }

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {string} strategyName
     * @param {object} factory
     */
    this.registerStrategy = (strategyName, factory) => {
        factories[strategyName] = factory;
    }

    /**
     * @param {string} strategyName
     * @param {object} options
     * @return {BarMapStrategyMixin}
     */
    this.create = (strategyName, options) => {
        const factory = factories[strategyName];
        options = options || {};
        return factory(options);
    }

    /**
     * @param {object} options
     * @return {DiffStrategy}
     */
    this.createDiffStrategy = (options) => {
        return new DiffStrategy(options);
    }

    initialize();
}

module.exports = Factory;
