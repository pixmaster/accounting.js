/*
 * version: 0.4.2-f0.1
 * It's fork by EShumov from -
 *
 * accounting.js v0.4.2
 * Copyright 2014 Open Exchange Rates
 *
 * Freely distributable under the MIT license.
 * Portions of accounting.js are inspired or borrowed from underscore.js
 *
 * Full details and documentation:
 * http://openexchangerates.github.io/accounting.js/
 */

(function (root, undefined) {
    // Create the local library object, to be exported or referenced globally later
    var lib = {};

    // Current version
    lib.version = '0.4.2-f0.1';
    lib.settings = {};

    // The library's settings configuration object. Contains default parameters for currency and number formatting
    lib.settings.default = {
        currency: {
            symbol: '$', // default currency symbol is '$'
            format: '%s%v', // controls output: %s = symbol, %v = value (can be object, see docs)
            decimal: '.', // decimal point separator
            thousand: ',', // thousands separator
            precision: 2, // decimal places
            grouping: 3   // digit grouping (not implemented yet)
        },
        number: {
            precision: 0, // default precision on numbers is 0
            grouping: 3, // digit grouping (not implemented yet)
            thousand: ',',
            decimal: '.'
        }
    };

    lib.settings.ru = {
        currency: {
            symbol: 'руб',
            format: '%v %s'
        }
    };

    // Store reference to possibly-available ECMAScript 5 methods for later
    var nativeMap = Array.prototype.map;
    var nativeIsArray = Array.isArray;
    var toString = Object.prototype.toString;

    /**
     * @description Tests whether supplied parameter is a string from underscore.js
     * @param {Object} obj
     * @returns {Boolean}
     */
    function isString(obj) {
        return !!(obj === '' || (obj && obj.charCodeAt && obj.substr));
    }

    /**
     * @description Tests whether supplied parameter is a string from underscore.js, delegates to ECMA5's native Array.isArray
     * @param {Object} obj
     * @returns {Boolean}
     */
    function isArray(obj) {
        return nativeIsArray ? nativeIsArray(obj) : toString.call(obj) === '[object Array]';
    }

    /**
     * @description Tests whether supplied parameter is a true object
     * @param {Object} obj
     * @returns {Boolean}
     */
    function isObject(obj) {
        return obj && toString.call(obj) === '[object Object]';
    }

    /**
     * @description Extends an object with a defaults object, similar to underscore's _.defaults. Used for abstracting parameter handling from API methods
     * @param {Object} object
     * @param {Object} defs
     * @returns {Object}
     */
    function mergeObjects(object, defs) {
        var key;
        object = object || {};
        defs = defs || {};
        // Iterate over object non-prototype properties:
        for (key in defs) {
            if (defs.hasOwnProperty(key)) {
                // Replace values with defaults only if undefined (allow empty/zero values):
                if (!(key in object) || !object[key]) object[key] = defs[key];
            }
        }
        return object;
    }

    /**
     * @description Implementation of `Array.map()` for iteration loops. Returns a new Array as a result of calling `iterator` on each array value. Defers to native Array.map if available.
     * @param {Array} obj
     * @param {Function} iterator
     * @param {*} context
     * @returns {Array}
     */
    function _map(obj, iterator, context) {
        var results = [];
        var i = 0;
        var j = 0;

        if (!obj) return results;

        // Use native .map method if it exists:
        if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);

        // Fallback for native .map:
        for (i = 0, j = obj.length; i < j; i++) {
            results[i] = iterator.call(context, obj[i], i, obj);
        }
        return results;
    }

    /**
     * @description Returns setting by key if exists otherwise default
     * @param {String} _key
     * @returns {Object}
     */
    function getSetting(_key) {
        if (_key && _key in lib.settings) {
            return mergeObjects(lib.settings[_key], lib.settings.default);
        }
        else {
            return lib.settings.default;
        }
    }

    /**
     * @description Check and normalise the value of precision (must be positive integer)
     * @param {Number} val
     * @param {Number} base
     * @returns {Number}
     */
    function checkPrecision(val, base) {
        val = Math.round(Math.abs(val));
        return isNaN(val) ? base : val;
    }

    /**
     * @description Parses a format string or object and returns format obj for use in rendering
     * `format` is either a string with the default (positive) format, or object
     * containing `pos` (required), `neg` and `zero` values (or a function returning
     * either a string or object)
     * Either string or format.pos must contain '%v' (value) to be valid
     * @param {String|Function|Object} format
     * @param {String} _settingKey
     * @returns {Object}
     */
    function checkCurrencyFormat(format, _settingKey) {
        // Allow function as format parameter (should return string or object):
        if (typeof format === 'function') format = format();

        format = format || getSetting(_settingKey).currency.format;

        if (isObject(format) && 'pos' in format && 'neg' in format && 'zero' in format) {
            return format;
        }
        else if (!isString(format) || !format.match('%v')) {
            format = getSetting().currency.format; // get default format
        }

        format = {
            pos: format,
            neg: format.replace('-', '').replace('%v', '-%v'),
            zero: format
        };

        if (_settingKey && _settingKey in lib.settings) {
            lib.settings[_settingKey].currency.format = format;
        }

        return format;
    }

    /**
     * @description Takes a string/array of strings, removes all formatting/cruft and returns the raw float value
     * Alias: `accounting.parse(string)`
     * Decimal must be included in the regular expression to match floats (defaults to
     * accounting.settings.number.decimal), so if the number uses a non-standard decimal
     * separator, provide it as the second argument.
     * Also matches bracketed negatives (eg. '$ (1.99)' => -1.99)
     * Doesn't throw any errors (`NaN`s become 0) but this may change in future
     * @param {String|Array} value
     * @param {String} [decimal]
     * @param {String} [settingKey]
     * @returns {Number}
     */
    var unformat = function (value, decimal, settingKey) {
        // Recursively unformat arrays:
        if (isArray(value)) {
            return _map(value, function (val) {
                return unformat(val, decimal, settingKey);
            });
        }

        // Fails silently (need decent errors):
        value = value || 0;

        // Return the value as-is if it's already a number:
        if (typeof value === 'number') return value;

        // Default decimal point comes from settings, but could be set to eg. ',' in opts:
        if (settingKey) {
            decimal = getSetting(settingKey).number.decimal;
        }

        decimal = decimal || getSetting().number.decimal;

        // Build regex to strip out everything except digits, decimal point and minus sign:
        var regex = new RegExp('[^0-9-' + decimal + ']', ['g']);
        var unformatted = parseFloat(
            ('' + value)
            .replace(/\((.*)\)/, '-$1') // replace bracketed values with negatives
            .replace(regex, '')         // strip out any cruft
            .replace(decimal, '.')      // make sure decimal point is standard
            );

        // This will fail silently which may cause trouble, let's wait and see:
        return !isNaN(unformatted) ? unformatted : 0;
    };
    lib.unformat = lib.parse = unformat;

    /**
     * @description Implementation of toFixed() that treats floats more like decimals
     * Fixes binary rounding issues (eg. (0.615).toFixed(2) === '0.61') that present problems for accounting- and finance-related software.
     * @param {Number} value
     * @param {Number|String} [precision]
     * @returns {Number}
     */
    var toFixed = function (value, precision) {
        var settingKey = undefined;

        if (isString(precision) && precision in lib.settings) {
            settingKey = precision;
            precision = undefined;
        }

        precision = checkPrecision(precision, getSetting(settingKey).number.precision);
        var power = Math.pow(10, precision);

        // Multiply up by precision, round accurately, then divide and use native toFixed():
        return (Math.round(lib.unformat(value) * power) / power).toFixed(precision);
    };
    lib.toFixed = toFixed;
    /**
     * @description Format a number, with comma-separated thousands and custom precision/decimal places
     * Localise by overriding the precision and thousand / decimal separators
     * 2nd parameter `precision` can be an object matching `settings.number`
     * @param {Number} number
     * @param {Number|String} [precision] If 'precision' is a string then use setting with name from string (example - 'en', 'fr')
     * @param {String} [thousand]
     * @param {String} [decimal]
     * @returns {String}
     */
    var formatNumber = function (number, precision, thousand, decimal) {
        var settingKey = undefined;
        var opts = {};
        var usePrecision = 0;
        var negative = '';
        var base = 0;
        var mod = 0;

        // Recursively format arrays:
        if (isArray(number)) {
            return _map(number, function (val) {
                return formatNumber(val, precision, thousand, decimal);
            });
        }

        if (isString(precision) && precision in lib.settings) {
            settingKey = precision;
            precision = undefined;
        }

        number = unformat(number);
        precision = isObject(precision) ? precision : {precision: precision, thousand: thousand, decimal: decimal};

        opts = mergeObjects(precision, getSetting(settingKey).number);
        usePrecision = checkPrecision(opts.precision);
        negative = number < 0 ? '-' : '';
        base = parseInt(toFixed(Math.abs(number || 0), usePrecision), 10) + '';
        mod = base.length > 3 ? base.length % 3 : 0;

        return negative + (mod ? base.substr(0, mod) + opts.thousand : '') + base.substr(mod).replace(/(\d{3})(?=\d)/g, '$1' + opts.thousand) + (usePrecision ? opts.decimal + toFixed(Math.abs(number), usePrecision).split('.')[1] : '');
    };
    lib.formatNumber = lib.format = formatNumber;

    /**
     * @description Format a number into currency
     * Usage: accounting.formatMoney(number, symbol, precision, thousandsSep, decimalSep, format)
     * defaults: (0, 2, '$', ',', '.', '%s%v')
     * Localise by overriding the symbol, precision, thousand / decimal separators and format
     * Second param can be an object matching `settings.currency` which is the easiest way.
     * @param {Number} number
     * @param {Number|String} [precision]
     * @param {String} [symbol]
     * @param {String} [thousand]
     * @param {String} [decimal]
     * @param {String} [format]
     * @returns {String}
     */
    var formatMoney = function (number, precision, symbol, thousand, decimal, format) {
        var settingKey = undefined;
        var opts = {};
        var formats = {};
        var useFormat = '';

        if (isArray(number)) {
            return _map(number, function (val) {
                return formatMoney(val, precision, symbol, thousand, decimal, format);
            });
        }

        if (isString(precision) && precision in lib.settings) {
            settingKey = precision;
            precision = undefined;
        }

        number = unformat(number);
        symbol = isObject(symbol) ? symbol : {symbol: symbol, precision: precision, thousand: thousand, decimal: decimal, format: format};

        opts = mergeObjects(symbol, getSetting(settingKey).currency);
        formats = checkCurrencyFormat(opts.format, settingKey);
        useFormat = number > 0 ? formats.pos : number < 0 ? formats.neg : formats.zero;

        return useFormat.replace('%s', opts.symbol).replace('%v', formatNumber(Math.abs(number), checkPrecision(opts.precision), opts.thousand, opts.decimal));
    };
    lib.formatMoney = formatMoney;

    // Export accounting for CommonJS. If being loaded as an AMD module, define it as such.
    // Otherwise, just add `accounting` to the global object
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = lib;
        }
        exports.accounting = lib;
    }
    else if (typeof define === 'function' && define.amd) {
        // Return the library as an AMD module:
        define([], function () {
            return lib;
        });
    }
    else {
        // Use accounting.noConflict to restore `accounting` back to its original value.
        // Returns a reference to the library's `accounting` object;
        // e.g. `var numbers = accounting.noConflict();`
        lib.noConflict = (function (oldAccounting) {
            return function () {
                // Reset the value of the root's `accounting` variable:
                root.accounting = oldAccounting;
                // Delete the noConflict method:
                lib.noConflict = undefined;
                // Return reference to the library to re-assign it:
                return lib;
            };
        })(root.accounting);

        // Declare `fx` on the root (global/window) object:
        root['accounting'] = lib;
    }

    // Root will be `window` in browser or `global` on the server:
}(this));
