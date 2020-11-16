/**
 * @param {object} options
 */
function Factory(options) {
    const DiffStrategy = require('./DiffStrategy');
    const LastestVersionStrategy = require('./LatestVersionStrategy');

    options = options || {};

    const factories = {};

    ////////////////////////////////////////////////////////////
    // Private methods
    ////////////////////////////////////////////////////////////

    const initialize = () => {
        const builtinStrategies = require("./bultinBrickMapStrategies");
        this.registerStrategy(builtinStrategies.DIFF, this.createDiffStrategy);
        this.registerStrategy(builtinStrategies.LATEST_VERSION, this.createLatestVersionStrategy);
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

    /**
     * @param {object} options
     * @return {LastestVersionStrategy}
     */
    this.createLatestVersionStrategy = (options) => {
        return new LastestVersionStrategy(options);
    }

    initialize();
}

module.exports = Factory;
