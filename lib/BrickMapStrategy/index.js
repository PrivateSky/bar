/**
 * @param {object} options
 */
function Factory(options) {
    const DiffStrategy = require('./DiffStrategy');

    options = options || {};

    const factories = {};

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    const initialize = () => {
        const builtinStrategies = require("./bultinBrickMapStrategies");
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
     * @return {BrickMapStrategyMixin}
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
