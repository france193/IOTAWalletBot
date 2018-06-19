/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** EXCEPTIONS **/
const InvalidKeyException = require('../error/InvalidKeyException');
const InvalidAddressException = require('../error/InvalidAddressException');
const InvalidSeedException = require('../error/InvalidSeedException');
const AddressAlreadyUsedException = require('../error/AddressAlreadyUsedException');
const AddressAlreadyUsedAsInputException = require('../error/AddressAlreadyUsedAsInputException');

/** REQUIRE **/
const Config = require('./config');
const Settings = require('../settings/settings');
const iotaFunctions = require('../functions/iota');

/** COSTANTS **/
const DEBUG = Settings.globalSettings.DEBUG;
const bot = Config.bot;
const log = Config.log;
const Client = Config.Client;
const iota = Config.iota;
const hash = Config.hash;

/** EXPORT **/
const e = module.exports = {};

e.printJSON = printJSON;
e.consoleLog = consoleLog;
e.returnDateIt = returnDateIt;
e.isIDAuthorized = isIDAuthorized;
e.checkSeedValidity = checkSeedValidity;
e.checkAddressUsageAsInput = checkAddressUsageAsInput;
e.checkAddressUsage = checkAddressUsage;
e.checkEncryptionKey = checkEncryptionKey;
e.checkUserStatusBeforePermittingActions = checkUserStatusBeforePermittingActions;
e.inputIsNotInInputsArray = inputIsNotInInputsArray;
e.getAddresswithMinBalance = getAddresswithMinBalance;
e.checkAddressValidity = checkAddressValidity;
e.botUnavailable = botUnavailable;

function printJSON(obj) {
	log.info(JSON.stringify(obj, null, "	"));
}

function consoleLog(purpose, functionName, message) {
	log.info("(" + purpose + ") - " + functionName + " - " + message);
}

function returnDateIt(today) {
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
}

function isIDAuthorized(id) {
	for (let i = 0; i < Config.IDs.length; i++) {
		if (Config.IDs[i] === id) {
			return true;
		}
	}

	return false;
}

function checkUserStatusBeforePermittingActions(id, functionName, request) {
	const client = new Client(Config.clientSettings);

	const checkUserStatus = {
		name: 'check-user-status',
		text: 'SELECT status FROM userstatus WHERE telegramid = $1',
		values: [id]
	};

	const selectUserKeynum = {
		name: 'select-user-keynum',
		text: 'SELECT keynum FROM wallets WHERE telegramid = $1',
		values: [id]
	};

	client.connect();

	try {
		client.query(checkUserStatus)
			.then(async function (res) {
				// number of row:
				const rows = Number(res.rows.length);

				if (rows === 0) {
					// 0: user doesn't exist

					// is a new user (no SEED)
					if (DEBUG) {
						consoleLog("DEBUG", functionName, "User hasn't a wallet");
					}

					client.end();

					let message = "To perform this action you need a Wallet, create a new one with /start command.";

					await bot.sendMessage(id, message);
				} else if (rows === 1) {
					// 1: user exists and has a SEED
					const status = res.rows[0].status;

					if (status === "USER_WITH_WALLET") {
						// user has a SEED
						if (DEBUG) {
							consoleLog("DEBUG", functionName, "User has a wallet");
						}

						client.query(selectUserKeynum)
							.then(async function (res) {
								const keynum = res.rows[0].keynum;

								client.end();

								switch (request) {
									case "WALLET_INFO":
										let message1 = "Please send me your #KEY_" + keynum + " to know your wallet balance:";

										await bot.sendMessage(id, message1, {
											ask: 'key_wallet_balance',
											replyMarkup: 'hide'
										});
										break;

									case "GET_NEW_ADDRESS":
										let message2 = "Please send me your #KEY_" + keynum + " to get an address from your wallet:";

										await bot.sendMessage(id, message2, {
											ask: 'key_get_address',
											replyMarkup: 'hide'
										});
										break;

									case "SEND_TRANSFER_TO_ADDRESS":
										let message3 = "To perform this payment, please send me: " +
											"\n - your #KEY_" + keynum + " to decrypt your SEED." +
											"\n - the amount of IOTA you want to send." +
											"\n - the #ADDRESS you want to send those IOTA." +
											"\n\n(!) Each one must be separated with 1 space! (!)";

										await bot.sendMessage(id, message3, {
											ask: 'key_send_iota_to_address',
											replyMarkup: 'hide'
										});
										break;

									case "DONATE":
										let message4 = "Thank you for supporting @IOTAWalletBot!" +
											"\nTo confirm your donation, send me:" +
											"\n - your #KEY_" + keynum + " to decrypt your SEED." +
											"\n - the amount of IOTA you want to donate." +
											"\n\n(!) Each one must be separated with 1 space! (!)";

										await bot.sendMessage(id, message4, {
											ask: 'key_donate',
											replyMarkup: 'hide'
										});
										break;

									default:
										await bot.sendMessage(id, "Error: unknown command (1).", {replyMarkup: 'hide'});
										break;
								}
							})
							.catch(function (e) {
								console.error(e.stack);
								client.end();
							});
					} else {
						client.end();

						let message = "To perform this action you need a Wallet, create a new one with /start command.";

						await bot.sendMessage(id, message);
					}
				}
			})
			.catch(function (e) {
				console.error(e.stack);
				client.end();
			});
	} catch (e) {
		consoleLog("ERROR", functionName, e);
	}
}

async function botUnavailable(id) {
	await bot.sendMessage(id,
		"Sorry, this Bot is not yet ready! To keep up-to-date:" +
		"\nhttps://t.me/france193_IOTAWalletBot_channel")
}

function inputIsNotInInputsArray(input, inputsArray) {
	for (let i = 0; i < inputsArray.length; i++) {
		if (inputsArray[i].address === input.address) {
			return false;
		}
	}
	return true;
}

function getAddresswithMinBalance(updatedAddresses) {
	let tempMin = {
		"address": updatedAddresses[0].address,
		"index": updatedAddresses[0].index,
		"balance": updatedAddresses[0].balance,
		"security": updatedAddresses[0].security
	};

	let x = 0;

	for (let i = 0; i < updatedAddresses.length; i++) {
		if (updatedAddresses[i].balance > 0) {
			if (updatedAddresses[i].balance < tempMin.balance) {
				tempMin = {
					"address": updatedAddresses[i].address,
					"index": updatedAddresses[i].index,
					"balance": updatedAddresses[i].balance,
					"security": updatedAddresses[i].security
				};
				x = i;
			}
		}
	}

	updatedAddresses.splice(x, 1);

	return tempMin;
}

function checkEncryptionKey(hashedkey, key, saltkey) {
	const hashedkey2 = hash.sha256().update(key + saltkey).digest('hex');

	const result = hashedkey === hashedkey2;

	if (result === false) {
		throw new InvalidKeyException("Key is not valid");
	}
}

function checkSeedValidity(seed) {
	if (!iota.valid.isAddress(seed)) {
		throw new InvalidSeedException("Seed passed is not invalid!");
	}
}

function checkAddressValidity(address) {
	if (!iota.valid.isAddress(address)) {
		throw new InvalidAddressException("Address passed is not invalid!");
	}
}

async function checkAddressUsage(address) {
	let txObj = await iotaFunctions.findTransactionObjects(iota, address);

	for (let i = 0; i < txObj.length; i++) {
		if (txObj[i].value !== 0) {
			throw new AddressAlreadyUsedException("Address passed has been already used!");
		}
	}
}

async function checkAddressUsageAsInput(address) {
	let txObj = await iotaFunctions.findTransactionObjects(iota, address);

	for (let i = 0; i < txObj.length; i++) {
		if (txObj[i].value !== 0) {
			throw new AddressAlreadyUsedAsInputException("Address passed has been already used as input!");
		}
	}
}
