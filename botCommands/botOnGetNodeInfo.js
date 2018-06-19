/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const iotaFunctions = require('../functions/iota');

/** constants **/
const iota = Config.iota;
const bot = Config.bot;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;

/** export **/
const e = module.exports = {};

e.botOnGetNodeInfo = botOnGetNodeInfo;

async function botOnGetNodeInfo(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;
	const functionName = "_botOnGetNodeInfo_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {

			try {
				// get current information about the node
				let nodeInfo = await iotaFunctions.getNodeInfo(iota);

				let date = Utils.returnDateIt(new Date(nodeInfo.time));

				const message = "NODE INFO" +
					"\n - Node: " + iota.provider +
					"\n - App Name: " + nodeInfo.appName +
					"\n - App Version: " + nodeInfo.appVersion +
					"\n - Milestone: " + nodeInfo.latestMilestoneIndex +
					"\n - Solid Subtangle Milestone: " + nodeInfo.latestSolidSubtangleMilestoneIndex +
					"\n - Neighbors: " + nodeInfo.neighbors +
					"\n - Time: " + date +
					"\n - Tips: " + nodeInfo.tips +
					"\n - Transactions To Request: " + nodeInfo.transactionsToRequest +
					"\n - Duration: " + nodeInfo.duration;

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
