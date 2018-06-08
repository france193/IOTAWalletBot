/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

/**
 * Functions:
 *
 * - getPriceFromBitfinex
 */

'use strict';

// to use common function
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const Config = require('../utilities/config');

// constants
const DEBUG = Settings.globalSettings.DEBUG;

// export
let e = module.exports = {};

e.getPriceFromBitfinex = getPriceFromBitfinex;

/**
 * Retrieve IOTA prices from bitfinex
 * @returns {Promise<any>}
 */
function getPriceFromBitfinex() {
	const functionName = "_getPriceFromBitfinex_";

	return new Promise(function (resolve, reject) {
		Config.bitfinex.ticker('iotusd', function (error, success) {
			if (error) {
				Utils.consoleLog("ERROR", functionName, error);
				reject(new Error(functionName + " - " + error));
			} else {
				if (DEBUG) {
					Utils.consoleLog("DEBUG", functionName, "success");
				}
				resolve(success.last_price);
			}
		});
	});
}
