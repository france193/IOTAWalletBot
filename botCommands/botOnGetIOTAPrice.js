/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const bitfinexFunctions = require('../functions/bitfinex');

/** constants **/
const bot = Config.bot;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;

/** export **/
const e = module.exports = {};

e.botOnGetIOTAPrice = botOnGetIOTAPrice;

async function botOnGetIOTAPrice(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;
	const functionName = "_botOnGetIOTAPrice_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			try {
				let lastPrice = await bitfinexFunctions.getPriceFromBitfinex();

				const message = "IOTA PRICES (bitfinex)" +
					"\n - 1 MIOTA is " + Number(lastPrice).toFixed(2) + " $." +
					"\n - 1 $ is " + Number(1 / lastPrice).toFixed(2) + " MIOTA.";

				await bot.sendMessage(chat_id, message);
			} catch (e) {
				Utils.consoleLog("ERROR", functionName, e);
			}
		} else {
			await Utils.botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}
