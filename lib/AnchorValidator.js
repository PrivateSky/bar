'use strict'

/**
 * 
 * @param {object} options 
 * @param {object} options.rules
 * @param {object} options.rules.preWrite
 * @param {object} options.rules.afterLoad
 */
function AnchorValidator(options) {
    options = options || {};

    let validationRules = options.rules || {};

    ////////////////////////////////////////////////////////////
    // Public methods
    ////////////////////////////////////////////////////////////

    /**
     * @param {string} stage The validation stage (afterLoad, preWrite, ...)
     * @param {...} args
     */
    this.validate = (stage, ...args) => {
        const callback = args[args.length - 1];
        if (typeof validationRules[stage] !== 'object') {
            return callback();
        }

        const stageValidation = validationRules[stage];
        if (typeof stageValidation.validate !== 'function') {
            return callback(new Error('Validation rules invalid. Missing the `validate` method'));
        }
        stageValidation.validate(...args);
    }

    /**
     * @param {object} rules
     * @param {object} rules.preWrite
     * @param {object} rules.afterLoad
     */
    this.setRules = (rules) => {
        validationRules = rules;
    }
}

module.exports = AnchorValidator;