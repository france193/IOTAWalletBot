/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');

/** constants **/
const bot = Config.bot;
const DEBUG = Settings.globalSettings.DEBUG;

/** export **/
const e = module.exports = {};

e.botOnText = botOnText;

async function botOnText(msg) {
	const id = msg.from.id;
	const functionName = "_botOnText_";

	let command;
	let chat_type = msg.chat.type;

	// if this not corresponds to a command (not start with /)
	if (msg.entities === undefined) {
		command = "TXT";
	} else {
		command = "CMD";
		if (msg.text !== "/start" &&
			msg.text !== "/wallet_balance" &&
			msg.text !== "/get_address" &&
			msg.text !== "/send_iota_to_address" &&
			msg.text !== "/donate" &&
			msg.text !== "/help" &&
			msg.text !== "/help_help" &&
			msg.text !== "/node_info" &&
			msg.text !== "/iota_prices") {
			await bot.sendMessage(id, "You entered a wrong command! Please, check all available command: /help or /help_help");
		}
	}

	let user = msg.from.first_name + " " + msg.from.last_name + " (" + msg.from.username + ")";

	if (DEBUG) {
		Utils.consoleLog("TEST", functionName, "[" + command + " - " + chat_type + "] - \"" + msg.text + "\" from: " + user);
	}
}
