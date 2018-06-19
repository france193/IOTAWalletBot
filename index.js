/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** IMPORTS **/
const Config = require('./utilities/config');

const {botOnText: botOnText} = require('./botCommands/botOnText');
const {botOnStart: botOnStart} = require('./botCommands/botOnStart');

const {botOnGetIOTAPrice: botOnGetIOTAPrice} = require('./botCommands/botOnGetIOTAPrice');
const {botOnGetNodeInfo: botOnGetNodeInfo} = require('./botCommands/botOnGetNodeInfo');
const {
	botOnHelp: botOnHelp,
	botOnHelpHelp: botOnHelpHelp
} = require('./botCommands/botOnHelp');

const {
	botOnGetAddress: botOnGetAddress,
	botOnGetAddressAfterReceivingData: botOnGetAddressAfterReceivingData
} = require('./botCommands/botOnGetAddress');
const {
	botOnWalletBalance: botOnWalletBalance,
	botOnWalletBalanceAfterReceivingData: botOnWalletBalanceAfterReceivingData
} = require('./botCommands/botOnWalletBalance');

const {
	botOnSendIOTAToAddress: botOnSendIOTAToAddress,
	botOnSendIOTAToAddressAfterReceivingData: botOnSendIOTAToAddressAfterReceivingData
} = require('./botCommands/botOnSendIOTAToAddress');
const {
	botOnDonate: botOnDonate,
	botOnDonateAfterReceivingData: botOnDonateAfterReceivingData
} = require('./botCommands/botOnDonate');

const {
	botOnStop: botOnStop,
	botOnReconnecting: botOnReconnecting,
	botOnReconnected: botOnReconnected,
	botOnError: botOnError
} = require('./botCommands/botStatus');

/** CONSTANT IMPORT **/
const bot = Config.bot;

/** BOT COMMANDS **/
bot.on(['text'], (msg) => botOnText(msg));

bot.on(['/start'], (msg) => botOnStart(msg));
bot.on(['/help'], (msg) => botOnHelp(msg));
bot.on(['/help_help'], (msg) => botOnHelpHelp(msg));

bot.on(['/node_info'], (msg) => botOnGetNodeInfo(msg));
bot.on(['/iota_prices'], (msg) => botOnGetIOTAPrice(msg));

bot.on(['/wallet_balance'], (msg) => botOnWalletBalance(msg));
bot.on(['/get_address'], (msg) => botOnGetAddress(msg));

bot.on(['/donate'], (msg) => botOnDonate(msg));
bot.on(['/send_iota_to_address'], (msg) => botOnSendIOTAToAddress(msg));

// ask events
bot.on('ask.key_wallet_balance', (msg) => botOnWalletBalanceAfterReceivingData(msg));
bot.on('ask.key_get_address', (msg) => botOnGetAddressAfterReceivingData(msg));
bot.on('ask.key_send_iota_to_address', (msg) => botOnSendIOTAToAddressAfterReceivingData(msg));
bot.on('ask.key_donate', (msg) => botOnDonateAfterReceivingData(msg));

// status
bot.on(['stop'], (msg, bot) => botOnStop(msg, bot));
bot.on(['reconnectiong'], (msg) => botOnReconnecting(msg));
bot.on(['reconnected'], (msg) => botOnReconnected(msg));
bot.on(['error'], (msg, bot) => botOnError(msg, bot));

/** START BOT **/
bot.start();
