/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** utils **/
const Config = require('./config');

const log = Config.log;

const e = module.exports = {};

e.printJSON = function (obj) {
	log.info(JSON.stringify(obj, null, "	"));
};

e.consoleLog = function (purpose, functionName, message) {
	log.info("(" + purpose + ") - " + functionName + " - " + message);
};

e.returnDateIt = function (today) {
	let day = today.getDate();
	let month = today.getMonth() + 1; //January is 0!
	let year = today.getFullYear();
	let hours = today.getHours();
	let minutes = today.getMinutes();
	let seconds = today.getSeconds();

	if (day < 10) {
		day = '0' + day;
	}

	if (month < 10) {
		month = '0' + month;
	}

	if (hours < 10) {
		hours = '0' + hours;
	}

	if (minutes < 10) {
		minutes = '0' + minutes;
	}

	if (seconds < 10) {
		seconds = '0' + seconds;
	}

	return day + '/' + month + '/' + year + ' @ ' + hours + ':' + minutes + ':' + seconds;
};

e.isIDAuthorized = function (id) {
	for (let i = 0; i < Config.IDs.length; i++) {
		if (Config.IDs[i] === id) {
			return true;
		}
	}

	return false;
};
