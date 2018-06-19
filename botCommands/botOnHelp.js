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
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;

/** export **/
const e = module.exports = {};

e.botOnHelp = botOnHelp;
e.botOnHelpHelp = botOnHelpHelp;

async function botOnHelp(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;

	const availableCommands = "ALL BOT COMMANDS" +
		"\n\n > COMMANDS AVAILABLE ONLY IN PRIVATE CHAT" +
		"\n --> /start" +
		"\n --> /wallet_balance" +
		"\n --> /get_address" +
		"\n --> /send_iota_to_address" +
		"\n --> /donate" +
		"\n\n > COMMANDS AVAILABLE EVERYWHERE" +
		"\n --> /help" +
		"\n --> /help_help" +
		"\n --> /node_info" +
		"\n --> /iota_prices" +
		"\n\nPLEASE NOTICE THAT THE GOAL OF THIS BOT IS TO PERMITS EASY PAYMENTS ON THE GO WITH IOTA NOT TO STORE " +
		"LARGE QUANTITIES OF IOTA!";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			await bot.sendMessage(chat_id, availableCommands);
		} else {
			await Utils.botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnHelpHelp(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;

	const availableCommands = "ALL BOT COMMANDS" +
		"\n\n > COMMANDS AVAILABLE ONLY IN PRIVATE CHAT" +
		"\n --> /start\nThis is the first command sent when you start the bot for the first time: create your wallet. " +
		"All the instruction for the wallet will be sent to you." +
		"\n --> /wallet_balance\nYou will be asked for your last key and then you'll receive your wallet balance." +
		"\n --> /get_address\nIf you want to receive a payment from someone you'll need an address! " +
		"You will be asked for your last key." +
		"\n --> /send_iota_to_address\nYou'll need to specify the recipient address, your last key and the " +
		"amount you want to send, then your payment will be done." +
		"\n --> /donate\nIf you want to support the development of this bot a donation will be very nice." +
		"\n\n > COMMANDS AVAILABLE EVERYWHERE" +
		"\n --> /help\nPrint this command list any time you'll need it." +
		"\n --> /node_info\nPrint out all information regarding the full node used by this bot." +
		"\n --> /iota_prices\nRetrieve IOTA/USD($) prices." +
		"\n\nPLEASE NOTICE THAT THE GOAL OF THIS BOT IS TO PERMITS EASY PAYMENTS ON THE GO WITH IOTA NOT TO STORE " +
		"LARGE QUANTITIES OF IOTA!";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			await bot.sendMessage(chat_id, availableCommands);
		} else {
			await Utils.botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}
