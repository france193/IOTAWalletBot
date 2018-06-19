/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/**
 * NPM LIBS
 **/
const TeleBot = require('telebot');
const settings_json = require('../settings/settings');
const IOTA = require('../libs/iota.lib.js');
const randomstring = require('randomstring');
const Bitfinex = require('bitfinex');
const CryptoJS = require("crypto-js");
const {Client, Pool} = require('pg');
const hash = require('hash.js');

/**
 * CONSTANTS
 **/
const SEED_length = 81;
const SEED_charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';

const key_length = 32;
const key_charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const salt_length = 64;
const salt_charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// authorized ID
const IDs = settings_json.TELEGRAM_AUTHORIZED_IDs;

const MIN_WEIGHT_MAGNITUDE = 14;
const DEPTH = 9;
const TRANSACTION_TAG = "IOTAWALLETBOT99999999999999";
const TRANSACTION_TAG_DONATION = "IOTAWALLETBOTDONATION999999";
const IOTA_MESSAGE = "Transaction sent from IOTAWalletBot.";
const MAX_LENGTH_TAG = 27;
const MAX_LENGTH_MESSAGE = 2187;

let bot;
let log;
let iota;
let clientSettings;
let bitfinex;

/**
 * BOT
 **/
let token;

if (settings_json.globalSettings.TEST) {
	token = settings_json.telegram.test_token;
	settings_json.telegram.webhook.isActive = false;
} else {
	token = settings_json.telegram.token;
	settings_json.telegram.webhook.isActive = true;
}

if (settings_json.telegram.webhook.isActive) {
	// webhook
	bot = new TeleBot({
		token: token,
		webhook: {
			// Self-signed certificate
			key: './settings/cert.key',
			cert: './settings/cert.pem',
			url: settings_json.telegram.webhook.url,
			// bind server with external ip and port
			host: settings_json.telegram.webhook.host,
			port: settings_json.telegram.webhook.port,
			maxConnections: settings_json.telegram.webhook.maxConnections
		},
		usePlugins: ['askUser']
	});
} else {
	bot = new TeleBot({
		token: token,
		polling: {
			interval: 1000, 	// Optional. How often check updates (in ms).
			timeout: 0, 		// Optional. Update polling timeout (0 - short polling).
			limit: 100, 		// Optional. Limits the number of updates to be retrieved.
			retryTimeout: 3000, // Optional. Reconnecting timeout (in ms).
		},
		usePlugins: ['askUser'],
	});
}

/**
 * SIMPLE NODE LOGGER
 **/
const SimpleNodeLogger = require('simple-node-logger');

const opts = {
	logFilePath: './logs/logfile_' + returnDate(new Date()) + '.txt',
	timestampFormat: 'YYYY-MM-DD HH:mm:ss'
};

log = SimpleNodeLogger.createSimpleLogger(opts);

/**
 * POSTGRESQL CONNECTION
 **/
clientSettings = {
	user: settings_json.PostgreSQL.user,
	host: settings_json.PostgreSQL.endpoint,
	database: settings_json.PostgreSQL.dbname,
	password: settings_json.PostgreSQL.password,
	port: settings_json.PostgreSQL.port,
};

/**
 * BITFINEX
 **/
bitfinex = new Bitfinex();

/**
 * IOTA
 **/
iota = new IOTA({
	'host': settings_json.IOTA_NODE.IOTANode_04.host,
	'port': settings_json.IOTA_NODE.IOTANode_04.port
});

/**
 * EXPORTS
 **/
let e = module.exports = {};

e.Client = Client;
e.Pool = Pool;
e.CryptoJS = CryptoJS;
e.bot = bot;
e.hash = hash;
e.bitfinex = bitfinex;
e.log = log;
e.clientSettings = clientSettings;
e.iota = iota;
e.IDs = IDs;
e.MIN_WEIGHT_MAGNITUDE = MIN_WEIGHT_MAGNITUDE;
e.DEPTH = DEPTH;
e.TRANSACTION_TAG = TRANSACTION_TAG;
e.IOTA_MESSAGE = IOTA_MESSAGE;
e.TRANSACTION_TAG_DONATION = TRANSACTION_TAG_DONATION;
e.MAX_LENGTH_TAG = MAX_LENGTH_TAG;
e.MAX_LENGTH_MESSAGE = MAX_LENGTH_MESSAGE;


e.getNewSeed = function () {
	return randomstring.generate({
		length: SEED_length,
		charset: SEED_charset
	});
};

e.getNewRandomKey = function () {
	return randomstring.generate({
		length: key_length,
		charset: key_charset
	});
};

e.getNewSalt = function () {
	return randomstring.generate({
		length: salt_length,
		charset: salt_charset
	});
};

// functions
function returnDate(today) {
	let day = today.getDate();
	let month = today.getMonth() + 1; //January is 0!

	let year = today.getFullYear();

	if (day < 10) {
		day = '0' + day;
	}

	if (month < 10) {
		month = '0' + month;
	}

	return year + '_' + month + '_' + day;
}
