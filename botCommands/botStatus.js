/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** botStatus **/
const Utils = require('../utilities/utils');

const e = module.exports = {};

e.botOnStop = function (msg, bot) {
	const functionName = "botOnStop";

	Utils.consoleLog("(DEBUG)", functionName, " > Bot STOPPED");
	Utils.printJSON(msg);

	bot.start();
};

e.botOnReconnectiong = function (msg) {
	const functionName = "botOnReconnectiong";

	Utils.consoleLog("(DEBUG)", functionName, " > Bot RECONNECTIONG");
	Utils.printJSON(msg);
};

e.botOnReconnected = function (msg) {
	const functionName = "botOnReconnected";

	Utils.consoleLog("(DEBUG)", functionName, " > Bot RECONNECTED");
	Utils.printJSON(msg);
};

e.botOnError = function (msg, bot) {
	const functionName = "botOnError";

	Utils.consoleLog("(DEBUG)", functionName, " > Bot ERROR");
	Utils.printJSON(msg);

	bot.stop();
};
