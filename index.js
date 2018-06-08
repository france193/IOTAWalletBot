/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** IMPORTS **/
const Config = require('./utilities/config');
const Utils = require('./utilities/utils');
const Settings = require('./settings/settings');

/** FUNCTIONS **/
const botStatus = require('./botCommands/botStatus');
const iotaFunctions = require('./functions/iota');
const bitfinexFunctions = require('./functions/bitfinex');
const dbFunctions = require('./functions/db');

/** EXCEPTIONS **/
const InvalidKeyException = require('./error/InvalidKeyException');
const InvalidAddressException = require('./error/InvalidAddressException');
const InvalidSeedException = require('./error/InvalidSeedException');
const CannotRetrieveWalletBalanceException = require('./error/CannotRetrieveWalletBalanceException');
const DatabaseException = require('./error/DatabaseException');
const AddressAlreadyUsedException = require('./error/AddressAlreadyUsedException');
const AddressAlreadyUsedAsInputException = require('./error/AddressAlreadyUsedAsInputException');

/** CONSTANTS **/
const DEBUG = Settings.globalSettings.DEBUG;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;
const DEBUG_VERBOSE = Settings.globalSettings.DEBUG_VERBOSE;

/** SITE URLS **/
const IOTASEARCH_URL = Settings.URLS.iotasearch;
const IOTAREATTACH_URL = Settings.URLS.iotareattach;
const THETAGLEORG_URL = Settings.URLS.thetangleorg;

/** CONSTANT IMPORT **/
const bot = Config.bot;
const iota = Config.iota;
const hash = Config.hash;
const Client = Config.Client;
const Pool = Config.Pool;
const CryptoJS = Config.CryptoJS;

/** BOT COMMANDS **/
bot.on(['text'], (msg) => botOnText(msg));

bot.on(['/start'], (msg) => botOnStart(msg));
bot.on(['/help'], (msg) => botOnHelp(msg));
bot.on(['/help_help'], (msg) => botOnHelpHelp(msg));

bot.on(['/node_info'], (msg) => botOnGetNodeInfo(msg));
bot.on(['/iota_prices'], (msg) => botOnGetIOTAPrice(msg));
bot.on(['/donate'], (msg) => botOnDonate(msg));

bot.on(['/wallet_balance'], (msg) => botOnWalletBalance(msg));
bot.on(['/get_address'], (msg) => botOnGetAddress(msg));
bot.on(['/send_iota_to_address'], (msg) => botOnSendIOTAToAddress(msg));

// ask events
bot.on('ask.key_wallet_balance', (msg) => botOnWalletBalanceAfterReceivingData(msg));
bot.on('ask.key_get_address', (msg) => botOnGetAddressAfterReceivingData(msg));
bot.on('ask.key_send_iota_to_address', (msg) => botOnSendIOTAToAddressAfterReceivingData(msg));
bot.on('ask.key_donate', (msg) => botOnDonateAfterReceivingData(msg));

// status
bot.on(['stop'], (msg, bot) => botStatus.botOnStop(msg, bot));
bot.on(['reconnectiong'], (msg) => botStatus.botOnReconnectiong(msg));
bot.on(['reconnected'], (msg) => botStatus.botOnReconnected(msg));
bot.on(['error'], (msg, bot) => botStatus.botOnError(msg, bot));

/** START BOT **/
bot.start();

/** BOT COMMANDS **/
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
			msg.text !== "/get_my_seed" &&
			msg.text !== "/renew_seed" &&
			msg.text !== "/wallet_balance" &&
			msg.text !== "/get_address" &&
			msg.text !== "/send_iota_to_address" &&
			msg.text !== "/donate" &&
			msg.text !== "/help" &&
			msg.text !== "/help_help" &&
			msg.text !== "/iota_prices") {
			await bot.sendMessage(id, "You entered a wrong command! Please, check all available command: /help or /help_help");
		}
	}

	let user = msg.from.first_name + " " + msg.from.last_name + " (" + msg.from.username + ")";

	if (DEBUG) {

		Utils.consoleLog("TEST", functionName, "[" + command + " - " + chat_type + "] - \"" + msg.text + "\" from: " + user);
	}
}

async function botOnStart(msg) {
	const id = msg.from.id;
	const chat_id = msg.chat.id;
	const chat_type = msg.chat.type;
	const username = msg.from.username;
	const functionName = "_botOnStart_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			if (chat_type === "group") {
				await bot.sendMessage(chat_id,
					"This command create your personal wallet on this bot and can be used only " +
					"on the private chat with the bot, please check @IOTAWalletBot.");
			}

			const pool = new Pool(Config.clientSettings);

			pool.connect((err, client, done) => {
				const insertNewUserStatus = {
					name: 'insert-new-user',
					text: 'INSERT INTO userstatus(telegramid, status) VALUES($1, $2)',
					values: [id, 'NEW_USER']
				};

				const checkUserStatus = {
					name: 'check-user-status',
					text: 'SELECT status FROM userstatus WHERE telegramid = $1',
					values: [id]
				};

				const shouldAbort = (err) => {
					if (err) {
						console.error('Error in transaction', err.stack);
						client.query('ROLLBACK', (err) => {
							if (err) {
								console.error('Error rolling back client', err.stack)
							}
							// release the client back to the pool
							done();
						})
					}
					return !!err
				};

				client.query('BEGIN', (err) => {
					if (shouldAbort(err)) {
						return;
					}

					client.query(checkUserStatus, async function (err, res) {
						if (shouldAbort(err)) {
							return;
						}

						const rows = Number(res.rows.length);

						if (rows === 0) {
							client.query(insertNewUserStatus, async function (err, res) {
								if (shouldAbort(err)) {
									return;
								}
								Utils.consoleLog("DB", functionName, "User state setted: NEW_USER");

								await insertNewSEED(client,
									id,
									done,
									shouldAbort,
									msg.from.first_name,
									msg.from.last_name,
									username
								);
							});

						} else if (rows === 1) {
							let status = res.rows[0].status;
							Utils.consoleLog("DB", functionName, "User state is: " + status);

							if (status === "NEW_USER") {
								await insertNewSEED(client,
									id,
									done,
									shouldAbort,
									msg.from.first_name,
									msg.from.last_name,
									username
								);
							} else if (status === "USER_WITH_WALLET") {
								Utils.consoleLog("DEBUG", functionName, "user has already a wallet");

								// reply to user
								await bot.sendMessage(id, "You have already created a wallet on this bot!");
							} else {
								Utils.consoleLog("ERROR", functionName, "user has an inconsistent state");

								// reply to user
								await bot.sendMessage(id, "You have already created a wallet on this bot!");
							}
						}
					});
				});
			});
		} else {
			await botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
		Utils.consoleLog("ERROR", functionName, e);
	}
}

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
			await botUnavailable(chat_id);
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
			await botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnWalletBalance(msg) {
	const id = msg.from.id;
	const chat_id = msg.chat.id;
	const chat_type = msg.chat.type;
	const functionName = "_botOnWalletBalance_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			if (chat_type === "group") {
				const message = "This command retrieve your personal wallet balance and can be used only " +
					"on the private chat with the bot, please check @IOTAWalletBot.";

				await bot.sendMessage(chat_id, message);
			}

			checkUserStatusBeforePermittingActions(id, functionName, "WALLET_INFO");
		} else {
			await botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnWalletBalanceAfterReceivingData(msg) {
	const id = msg.from.id;
	const functionName = "_botOnWalletBalanceAfterReceivingData_";

	try {
		// if this not corresponds to a command (not start with /)
		if (msg.entities === undefined) {
			const key = String(msg.text);

			const pool = new Pool(Config.clientSettings);

			const takeUserESEED = {
				name: 'fetch-user',
				text: 'SELECT * FROM wallets WHERE telegramid = $1',
				values: [id]
			};

			pool.connect((err, client, done) => {

				const shouldAbort = (err) => {
					if (err) {
						console.error('Error in transaction', err.stack);
						client.query('ROLLBACK', (err) => {
							if (err) {
								console.error('Error rolling back client', err.stack)
							}
							// release the client back to the pool
							done();
						})
					}
					return !!err
				};

				client.query('BEGIN', (err) => {
					if (shouldAbort(err)) {
						return;
					}

					client.query(takeUserESEED, async function (err, res) {
						if (shouldAbort(err)) {
							return;
						}

						const eSEED = res.rows[0].seed;
						const hashedkey = res.rows[0].hashedkey;
						const saltkey = res.rows[0].saltkey;
						let keynum = res.rows[0].keynum;

						keynum++;
						const key_new = Config.getNewRandomKey();

						try {
							checkEncryptionKey(hashedkey, key, saltkey);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "key is valid!");
							}

							await bot.sendMessage(id, "> #KEY received... processing...");

							// DECRYPT
							const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
							const SEED = bytes.toString(CryptoJS.enc.Utf8);

							checkSeedValidity(SEED);

							let price = await bitfinexFunctions.getPriceFromBitfinex();

							try {
								let balance = await iotaFunctions.getConfirmedBalance(iota, SEED);

								if (DEBUG) {
									Utils.consoleLog("DEBUG", functionName, "success retrieving account data!");
								}

								let balance_n = balance;
								let amount;
								let dollar;

								if (balance >= 0 && balance < 1000) {
									// iota
									amount = balance + " i";
								} else if (balance >= 1000 && balance < 1000000) {
									// Ki
									amount = iota.utils.convertUnits(balance, 'i', 'Ki') + " Ki";
								} else if (balance >= 1000000 && balance < 1000000000) {
									// Mi
									amount = iota.utils.convertUnits(balance, 'i', 'Mi') + " Mi";
								} else if (balance >= 1000000000 && balance < 1000000000000) {
									// Gi
									amount = iota.utils.convertUnits(balance, 'i', 'Gi') + " Gi";
								} else if (balance >= 1000000000000 && balance < 1000000000000000) {
									// Ti
									amount = iota.utils.convertUnits(balance, 'i', 'Ti') + " Ti";
								} else if (balance >= 1000000000000000) {
									// Pi
									amount = iota.utils.convertUnits(balance, 'i', 'Pi') + " Pi";
								} else {
									amount = undefined;
								}

								if (price !== undefined) {
									let x = price / 1000000;
									dollar = Number(x * balance_n).toFixed(2);
								}

								let message;

								if (amount === undefined) {
									message = "WALLET BALANCE" +
										"\n> There was an error retrieving your balance, please retry: /wallet_balance" +
										"\n\nYou will receive the #KEY_" + keynum + ".";
								} else {
									if (dollar === undefined) {
										message = "WALLET BALANCE" +
											"\n> Your confirmed balance is: " + amount + "" +
											"\n\nYou will receive the #KEY_" + keynum + ".";
									} else {
										message = "WALLET BALANCE" +
											"\n> Your confirmed balance is: " + amount + "" +
											"\n>  ~" + dollar + " $ (1 MIOTA is " + Number(price).toFixed(2) + " $)" +
											"\n\nYou will receive the #KEY_" + keynum + ".";
									}
								}

								await bot.sendMessage(id, message);
								await bot.sendMessage(id, key_new);

								if (DEBUG) {
									Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
								}

								const saltkey_new = Config.getNewSalt();
								const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
								const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

								const updateESEEDForUserQuery = {
									// give the query a unique name
									name: 'create-new-wallet',
									text: 'UPDATE wallets SET seed = $1, keynum = $2, hashedkey = $3, saltkey = $4 WHERE telegramid = $5',
									values: [eSEED_new, keynum, hashedkey_new, saltkey_new, id]
								};

								client.query(updateESEEDForUserQuery, (err, res) => {
									if (shouldAbort(err)) {
										return;
									}

									if (DEBUG) {
										Utils.consoleLog("DB", functionName, "key updated!");
									}

									if (DEBUG_VERBOSE) {
										Utils.printJSON(res);
									}

									client.query('COMMIT', async function (err) {
										if (err) {
											console.error('Error committing transaction', err.stack)
										}

										await bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

										done();
									})
								});
							} catch (e) {
								if (e instanceof CannotRetrieveWalletBalanceException) {
									done();

									Utils.consoleLog("ERROR", functionName, e);

									const message = "FAILED TO GET WALLET BALANCE" +
										"\nThere was an error getting your wallet balance." +
										"\nIf you want to retry: retype /wallet_balance." +
										"\n\nYou will receive the #KEY_" + keynum + ".";

									await bot.sendMessage(id, message);
									await bot.sendMessage(id, key_new);

									if (DEBUG) {
										Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
									}

									const saltkey_new = Config.getNewSalt();
									const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
									const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

									const updateESEEDForUserQuery = {
										// give the query a unique name
										name: 'create-new-wallet',
										text: 'UPDATE wallets SET seed = $1, keynum = $2, hashedkey = $3, saltkey = $4 WHERE telegramid = $5',
										values: [eSEED_new, keynum, hashedkey_new, saltkey_new, id]
									};

									client.query(updateESEEDForUserQuery, (err, res) => {
										if (shouldAbort(err)) {
											return;
										}

										Utils.consoleLog("DB", functionName, "key updated!");

										client.query('COMMIT', async function (err) {
											if (err) {
												console.error('Error committing transaction', err.stack)
											}

											await bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

											done();
										})
									});
								}
							}

						} catch (e) {
							if (e instanceof InvalidKeyException) {
								Utils.consoleLog("DEBUG", functionName, "User key is NOT valid!");

								done();

								await bot.sendMessage(id,
									"Wrong key, If you want to know your balance, retype " +
									"/wallet_balance and send me the correct key.");
							} else if (e instanceof InvalidSeedException) {
								Utils.consoleLog("DEBUG", functionName, "User SEED is NOT valid!");

								done();

								await bot.sendMessage(id,
									"There was an error decrypting your SEED. Please ensure to pass the " +
									"correct key. If you want to know your balance, retype /wallet_balance.");
							}
						}
					});
				});
			});
		} else {
			await bot.sendMessage(id,
				"An error occurred waiting for the key, If you want to know your balance, retype /wallet_balance.");
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnGetAddress(msg) {
	const id = msg.from.id;
	const chat_id = msg.chat.id;
	const chat_type = msg.chat.type;
	const functionName = "_botOnGetAddress_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			if (chat_type === "group") {
				const message = "This command generate a new address from your personal wallet and can be used only " +
					"on the private chat with the bot, please check @IOTAWalletBot.";

				await bot.sendMessage(chat_id, message);
			}

			checkUserStatusBeforePermittingActions(id, functionName, "GET_NEW_ADDRESS");
		} else {
			await botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnGetAddressAfterReceivingData(msg) {
	const id = msg.from.id;
	const functionName = "_botOnGetAddressAfterReceivingData_";

	try {
		// if this not corresponds to a command (not start with /)
		if (msg.entities === undefined) {
			const key = String(msg.text);

			const pool = new Pool(Config.clientSettings);

			const takeUserESEED = {
				name: 'fetch-user',
				text: 'SELECT * FROM wallets WHERE telegramid = $1',
				values: [id]
			};

			pool.connect((err, client, done) => {
				const shouldAbort = (err) => {
					if (err) {
						console.error('Error in transaction', err.stack);
						client.query('ROLLBACK', (err) => {
							if (err) {
								console.error('Error rolling back client', err.stack)
							}
							// release the client back to the pool
							done();
						})
					}
					return !!err
				};

				client.query('BEGIN', (err) => {
					if (shouldAbort(err)) {
						return;
					}

					client.query(takeUserESEED, async function (err, res) {
						if (shouldAbort(err)) {
							return;
						}

						const eSEED = res.rows[0].seed;
						let index = res.rows[0].next_index;
						const hashedkey = res.rows[0].hashedkey;
						const saltkey = res.rows[0].saltkey;
						let keynum = res.rows[0].keynum;

						try {
							checkEncryptionKey(hashedkey, key, saltkey);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "key is valid!");
							}

							await bot.sendMessage(id, "> #KEY received... processing...");

							// DECRYPT
							const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
							const SEED = bytes.toString(CryptoJS.enc.Utf8);

							checkSeedValidity(SEED);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "user SEED is valid!");
							}

							keynum++;
							const key_new = Config.getNewRandomKey();

							try {
								const address = await iotaFunctions.getAddress(iota, SEED, index);

								if (DEBUG) {
									Utils.consoleLog("DEBUG", functionName, "success generating new address!");
								}

								checkAddressValidity(address);

								const message = "ADDRESS GENERATED" +
									"\n(share it to receive IOTA)" +
									"\n\n#ADDRESS_" + index + ":";

								await bot.sendMessage(id, message);
								await bot.sendMessage(id, address);
								await bot.sendMessage(id, "You will receive the #KEY_" + keynum + ".");
								await bot.sendMessage(id, key_new);

								if (DEBUG) {
									Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
								}

								const saltkey_new = Config.getNewSalt();
								const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
								const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

								const updateESEEDForUserQuery = {
									// give the query a unique name
									name: 'create-new-wallet',
									text: 'UPDATE wallets SET seed = $1, next_index = $2, keynum = $3, hashedkey = $4, saltkey = $5 WHERE telegramid = $6',
									values: [eSEED_new, index + 1, keynum, hashedkey_new, saltkey_new, id]
								};

								await iotaFunctions.attachToTangle(iota, SEED, address, Config.DEPTH, Config.MIN_WEIGHT_MAGNITUDE);

								const insertNewAddress = {
									// give the query a unique name
									name: 'insert-new-address',
									text: 'INSERT INTO addresses (address, telegram_sender_id, index, balance, security, used_as_input)' +
									'VALUES($1, $2, $3, $4, $5, $6)',
									values: [iota.utils.noChecksum(address), id, index, 0, 2, false]
								};

								await dbFunctions.executeQueryOnTransaction(client, insertNewAddress, shouldAbort);

								client.query(updateESEEDForUserQuery, (err, res) => {
									if (shouldAbort(err)) {
										return;
									}

									Utils.consoleLog("DB", functionName, "key updated!");

									client.query('COMMIT', async function (err) {
										if (err) {
											console.error('Error committing transaction', err.stack)
										}

										await bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

										done();
									});
								});
							} catch (e) {
								done();

								const message = "FAILED TO GENERATE A NEW ADDRESS" +
									"\nThere was an error generating the new address." +
									"\nIf you want to retry: retype /get_address." +
									"\n\nYou will receive the #KEY_" + keynum + ".";

								await bot.sendMessage(id, message);
								await bot.sendMessage(id, key_new);

								if (DEBUG) {
									Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
								}

								const saltkey_new = Config.getNewSalt();
								const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
								const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

								const updateESEEDForUserQuery = {
									// give the query a unique name
									name: 'create-new-wallet',
									text: 'UPDATE wallets SET seed = $1, keynum = $2, hashedkey = $3, saltkey = $4 WHERE telegramid = $5',
									values: [eSEED_new, keynum, hashedkey_new, saltkey_new, id]
								};

								client.query(updateESEEDForUserQuery, (err, res) => {
									if (shouldAbort(err)) {
										return;
									}

									Utils.consoleLog("DB", functionName, "key updated!");

									client.query('COMMIT', async function (err) {
										if (err) {
											console.error('Error committing transaction', err.stack)
										}

										bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

										done();
									})
								});
							}
						} catch (e) {
							if (e instanceof InvalidKeyException) {
								Utils.consoleLog("DEBUG", functionName, "User key is NOT valid!");

								done();

								await bot.sendMessage(id,
									"Wrong key, If you want to retry: retype /get_address and " +
									"send me the correct key.");
							} else if (e instanceof InvalidSeedException) {
								Utils.consoleLog("DEBUG", functionName, "User SEED is NOT valid!");

								done();

								await bot.sendMessage(id,
									"There was an error decrypting your SEED. Please ensure to pass the " +
									"correct key. If you want to retry: retype /get_address.");
							}
						}
					});
				});
			});
		} else {
			await bot.sendMessage(id,
				"An error occurred waiting for the key, If you want to create a new address: " +
				"retype /get_address.");
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnSendIOTAToAddress(msg) {
	const id = msg.from.id;
	const chat_id = msg.chat.id;
	const chat_type = msg.chat.type;
	const functionName = "_botOnSendIOTAToAddress_";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			if (chat_type === "group") {
				const message = "This command send some IOTA a payment to a specified address and can be used only " +
					"on the private chat with the bot, please check @IOTAWalletBot.";

				await bot.sendMessage(chat_id, message);
			}

			checkUserStatusBeforePermittingActions(id, functionName, "SEND_TRANSFER_TO_ADDRESS");
		} else {
			await botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnSendIOTAToAddressAfterReceivingData(msg) {
	const id = msg.from.id;
	const functionName = "_botOnSendIOTAToAddressAfterReceivingData_";

	// if this not corresponds to a command (not start with /)
	if (msg.entities === undefined) {
		const text = String(msg.text);

		let stringArray = text.split(/(\s+)/).filter(function (e) {
			return e.trim().length > 0;
		});

		const key = stringArray[0];
		const iota_amount = stringArray[1];
		const recipientAddress = stringArray[2];

		const pool = new Pool(Config.clientSettings);

		const takeUserESEED = {
			name: 'fetch-user',
			text: 'SELECT * FROM wallets WHERE telegramid = $1',
			values: [id]
		};

		pool.connect((err, client, done) => {
			const shouldAbort = (err) => {
				if (err) {
					console.error('Error in transaction', err.stack);
					client.query('ROLLBACK', (err) => {
						if (err) {
							console.error('Error rolling back client', err.stack)
						}
						// release the client back to the pool
						done();
					})
				}
				return !!err
			};

			client.query('BEGIN', (err) => {
				if (shouldAbort(err)) {
					return;
				}

				client.query(takeUserESEED, async (err, res) => {
					if (shouldAbort(err)) {
						return;
					}

					const eSEED = res.rows[0].seed;
					const hashedkey = res.rows[0].hashedkey;
					const saltkey = res.rows[0].saltkey;
					let keynum = res.rows[0].keynum;
					let index = res.rows[0].next_index;

					try {
						checkEncryptionKey(hashedkey, key, saltkey);

						if (DEBUG) {
							Utils.consoleLog("DEBUG", functionName, "key is valid!");
						}

						keynum++;
						const key_new = Config.getNewRandomKey();

						// DECRYPT
						const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
						const SEED = bytes.toString(CryptoJS.enc.Utf8);

						try {
							await bot.sendMessage(id, "> #KEY received... processing...");

							checkSeedValidity(SEED);

							checkAddressValidity(recipientAddress);

							//await checkAddressUsageAsInput(recipientAddress);

							// This bond is safer but much more stringent
							await checkAddressUsage(recipientAddress);

							await bot.sendMessage(id, "> #ADDRESS received... processing...");

							// retrieve all address for this seed
							const addresses = await dbFunctions.retrieveAddresses(iota, id);

							// update all addressess' balances
							const updatedAddresses = await iotaFunctions.updateAddressesBalances(iota, addresses);

							/*
							// update all addressess' balances on DB before transaction
							for (let i = 0; i < updatedAddresses.length; i++) {
								let updateAddress = {
									// give the query a unique name
									name: 'update-address-' + i,
									text: 'UPDATE addresses SET balance = $1, used_as_input = $2 WHERE address = $3',
									values: [updatedAddresses[i].balance, false, updatedAddresses[i].address]
								};

								await dbFunctions.executeQueryOnTransaction(client, updateAddress, shouldAbort);
							}
							*/

							if (updatedAddresses.length === 0) {
								throw new Error('cannot get addresses');
							}

							// retrieve addresses satisfying requested IOTA amount
							let temp_balance = 0;
							let tempInputsArray = [];
							let addressesToBeUpdated = [];
							while (temp_balance < iota_amount) {
								if (updatedAddresses.length > 0) {
									let input = getAddresswithMinBalance(updatedAddresses);
									if (inputIsNotInInputsArray(input, tempInputsArray)) {
										tempInputsArray.push(input);
										temp_balance += input.balance;
										let addressToBeUpdated = {
											'type': 'input',
											'address': input.address
										};
										addressesToBeUpdated.push(addressToBeUpdated);
									}
								} else {
									throw new Error('not enough balance');
								}
							}

							let remainderAddress = undefined;

							if (temp_balance > iota_amount) {
								remainderAddress = await iotaFunctions.getAddress(iota, SEED, index);

								//await iotaFunctions.attachToTangle(iota, SEED, address, Config.DEPTH, Config.MIN_WEIGHT_MAGNITUDE);

								let remainderAddressBalance = temp_balance - iota_amount;

								let addressToBeUpdated = {
									'type': 'remainder',
									'address': remainderAddress,
									'balance': remainderAddressBalance
								};
								addressesToBeUpdated.push(addressToBeUpdated);

								//add new address on db
								const insertNewAddressQuery = {
									// give the query a unique name
									name: 'insert-new-address',
									text: 'INSERT INTO addresses (address, telegram_sender_id, index, balance, security, used_as_input)' +
									'VALUES($1, $2, $3, $4, $5, $6)',
									values: [iota.utils.noChecksum(remainderAddress), id, index, remainderAddressBalance, 2, false]
								};

								await dbFunctions.executeQueryOnTransaction(client, insertNewAddressQuery, shouldAbort);

								index++;
							}

							if (DEBUG_VERBOSE) {
								Utils.printJSON(addressesToBeUpdated);
							}

							// after transaction
							for (let i = 0; i < addressesToBeUpdated.length; i++) {
								let updateAddress = {
									// give the query a unique name
									name: 'update-address-' + i,
									text: 'UPDATE addresses SET balance = $1, used_as_input = $2 WHERE address = $3',
									values: [0, true, addressesToBeUpdated[i].address]
								};

								await dbFunctions.executeQueryOnTransaction(client, updateAddress, shouldAbort);
							}

							let inputsArray = [];

							for (let i = 0; i < tempInputsArray.length; i++) {
								let input = {
									address: String(tempInputsArray[i].address),
									balance: Number(tempInputsArray[i].balance),
									keyIndex: Number(tempInputsArray[i].index),
									security: Number(tempInputsArray[i].security)
								};
								inputsArray.push(input);
							}

							const trytes = await iotaFunctions.prepareTransfer(
								iota,
								SEED,
								recipientAddress,
								iota_amount,
								Config.IOTA_MESSAGE,
								Config.TRANSACTION_TAG,
								remainderAddress,
								inputsArray
							);

							const tx = await iotaFunctions.sendTrytes(iota, trytes, Config.DEPTH, Config.MIN_WEIGHT_MAGNITUDE);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "success sendTrytes!");
								if (DEBUG_VERBOSE) {
									Utils.printJSON(tx);
								}
							}

							const t_bundle = tx[0].bundle;
							const t_hash = tx[0].hash;
							const t_timestamp = tx[0].attachmentTimestamp;

							const insertTXOnTXHistory = {
								// give the query a unique name
								name: 'insert-on-tx-history',
								text: 'INSERT INTO tx_history(tx_hash, telegram_sender_id, tx_bundle, tx_persistence, reattached, tx_attach_timestamp)' +
								'VALUES($1, $2, $3, $4, $5, $6)',
								values: [t_hash, id, t_bundle, false, 0, t_timestamp]
							};

							await dbFunctions.executeQueryOnTransaction(client, insertTXOnTXHistory, shouldAbort);

							const message = "PAYMENT SENT" +
								"\nYour payment of " + iota_amount + " IOTA is on the way!" +
								"\n\n > The bundle of your transaction is:" +
								"\n" + t_bundle +
								"\n\n > If you want to see your transaction confirmation status:\n" + THETAGLEORG_URL + t_bundle +
								"\n\n > If you want to speed up the confirmation: " + IOTAREATTACH_URL +
								"\n\nYou will receive the #KEY_" + keynum + ".";

							await bot.sendMessage(id, message);
							await bot.sendMessage(id, key_new);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
							}

							const saltkey_new = Config.getNewSalt();
							const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
							const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

							const updateESEEDForUserQuery = {
								// give the query a unique name
								name: 'create-new-wallet',
								text: 'UPDATE wallets SET seed = $1, next_index = $2, keynum = $3, hashedkey = $4, saltkey = $5 WHERE telegramid = $6',
								values: [eSEED_new, index, keynum, hashedkey_new, saltkey_new, id]
							};

							client.query(updateESEEDForUserQuery, (err, res) => {
								if (shouldAbort(err)) {
									return;
								}

								Utils.consoleLog("DB", functionName, "key updated!");

								client.query('COMMIT', (err) => {
									if (err) {
										console.error('Error committing transaction', err.stack)
									}

									bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

									done();
								})
							});
						} catch (e) {
							Utils.consoleLog("ERROR", functionName, e);

							let message = "PAYMENT FAILED" +
								"\nThere was an error performing your payment.";

							if (e instanceof InvalidSeedException) {
								message += "\nThere was an error decrypting your SEED.";
							} else if (e instanceof InvalidAddressException) {
								message += "\nThe address you provided it is not valid.";
							} else if (e instanceof DatabaseException) {
								message += "\nThere was an error accessing to seed's addresses.";
							} else if (e instanceof AddressAlreadyUsedException) {
								message += "\nIt is possible that this recipient address has already been used. " +
									"For security reason provide another recipient address.";
							} else if (e instanceof AddressAlreadyUsedAsInputException) {
								message += "\nIt is possible that this recipient address has already been used as input. " +
									"For security reason provide another recipient address.";
							}

							message += "\nIf you want to retry: retype /send_iota_to_address." +
								"\n\nYou will receive the #KEY_" + keynum + ".";

							await bot.sendMessage(id, message);
							await bot.sendMessage(id, key_new);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
							}

							const saltkey_new = Config.getNewSalt();
							const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
							const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

							const updateESEEDForUserQuery = {
								// give the query a unique name
								name: 'create-new-wallet',
								text: 'UPDATE wallets SET seed = $1, keynum = $2, hashedkey = $3, saltkey = $4 WHERE telegramid = $5',
								values: [eSEED_new, keynum, hashedkey_new, saltkey_new, id]
							};

							client.query(updateESEEDForUserQuery, (err, res) => {
								if (shouldAbort(err)) {
									return;
								}

								Utils.consoleLog("DB", functionName, "key updated!");

								client.query('COMMIT', (err) => {
									if (err) {
										console.error('Error committing transaction', err.stack)
									}

									bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

									done();
								})
							});
						}

					} catch (e) {
						if (e instanceof InvalidKeyException) {
							Utils.consoleLog("DEBUG", functionName, "User key is NOT valid!");

							done();

							return bot.sendMessage(id,
								"Wrong key, If you want to perform the payment: retype /send_iota_to_address " +
								"and send me the correct key.");
						}
					}
				});
			});
		});
	} else {
		await bot.sendMessage(id,
			"An error occurred waiting for the key, If you want to perform the payment retype /send_iota_to_address.");
	}
}

async function botOnGetNodeInfo(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;

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
			await botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnGetIOTAPrice(msg) {
	const chat_id = msg.chat.id;
	const id = msg.from.id;

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
			await botUnavailable(chat_id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnDonate(msg) {
	const id = msg.from.id;
	const chat_id = msg.chat.id;
	const chat_type = msg.chat.type;
	const functionName = "botOnDonate";

	try {
		if (Utils.isIDAuthorized(id) || PUBLIC_BOT) {
			if (chat_type === "group") {
				const message = "This command donate some IOTA to support this bot and can be used only " +
					"on the private chat with the bot, please check @IOTAWalletBot.";

				await bot.sendMessage(chat_id, message);
			}

			checkUserStatusBeforePermittingActions(id, functionName, "DONATE");
		} else {
			await botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function botOnDonateAfterReceivingData(msg) {
	const id = msg.from.id;
	const functionName = "_botOnDonateAfterReceivingData_";

	// if this not corresponds to a command (not start with /)
	if (msg.entities === undefined) {
		const text = String(msg.text);

		let stringArray = text.split(/(\s+)/).filter(function (e) {
			return e.trim().length > 0;
		});

		const key = stringArray[0];
		const iota_amount = stringArray[1];

		const pool = new Pool(Config.clientSettings);

		const takeUserESEED = {
			name: 'fetch-user',
			text: 'SELECT * FROM wallets WHERE telegramid = $1',
			values: [id]
		};

		pool.connect((err, client, done) => {
			const shouldAbort = (err) => {
				if (err) {
					console.error('Error in transaction', err.stack);
					client.query('ROLLBACK', (err) => {
						if (err) {
							console.error('Error rolling back client', err.stack)
						}
						// release the client back to the pool
						done();
					})
				}
				return !!err
			};

			client.query('BEGIN', (err) => {
				if (shouldAbort(err)) {
					return;
				}

				client.query(takeUserESEED, async (err, res) => {
					if (shouldAbort(err)) {
						return;
					}

					const eSEED = res.rows[0].seed;
					const hashedkey = res.rows[0].hashedkey;
					const saltkey = res.rows[0].saltkey;
					let keynum = res.rows[0].keynum;
					let index = res.rows[0].next_index;

					try {
						checkSeedValidity(Settings.DONATION_SEED);
						const recipientAddress = await iotaFunctions.getAddress(iota, Settings.DONATION_SEED);

						checkEncryptionKey(hashedkey, key, saltkey);

						if (DEBUG) {
							Utils.consoleLog("DEBUG", functionName, "key is valid!");
						}

						keynum++;
						const key_new = Config.getNewRandomKey();

						// DECRYPT
						const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
						const SEED = bytes.toString(CryptoJS.enc.Utf8);

						try {
							await bot.sendMessage(id, "> #KEY received... processing...");

							checkSeedValidity(SEED);

							checkAddressValidity(recipientAddress);

							//await checkAddressUsageAsInput(recipientAddress);

							// This bond is safer but much more stringent
							await checkAddressUsage(recipientAddress);

							await bot.sendMessage(id, "> #ADDRESS received... processing...");

							// retrieve all address for this seed
							const addresses = await dbFunctions.retrieveAddresses(iota, id);

							// update all addressess' balances
							const updatedAddresses = await iotaFunctions.updateAddressesBalances(iota, addresses);

							/*
							// update all addressess' balances on DB before transaction
							for (let i = 0; i < updatedAddresses.length; i++) {
								let updateAddress = {
									// give the query a unique name
									name: 'update-address-' + i,
									text: 'UPDATE addresses SET balance = $1, used_as_input = $2 WHERE address = $3',
									values: [updatedAddresses[i].balance, false, updatedAddresses[i].address]
								};

								await dbFunctions.executeQueryOnTransaction(client, updateAddress, shouldAbort);
							}
							*/

							if (updatedAddresses.length === 0) {
								throw new Error('cannot get addresses');
							}

							// retrieve addresses satisfying requested IOTA amount
							let temp_balance = 0;
							let tempInputsArray = [];
							let addressesToBeUpdated = [];
							while (temp_balance < iota_amount) {
								if (updatedAddresses.length > 0) {
									let input = getAddresswithMinBalance(updatedAddresses);
									if (inputIsNotInInputsArray(input, tempInputsArray)) {
										tempInputsArray.push(input);
										temp_balance += input.balance;
										let addressToBeUpdated = {
											'type': 'input',
											'address': input.address
										};
										addressesToBeUpdated.push(addressToBeUpdated);
									}
								} else {
									throw new Error('not enough balance');
								}
							}

							let remainderAddress = undefined;

							if (temp_balance > iota_amount) {
								remainderAddress = await iotaFunctions.getAddress(iota, SEED, index);

								//await iotaFunctions.attachToTangle(iota, SEED, address, Config.DEPTH, Config.MIN_WEIGHT_MAGNITUDE);

								let remainderAddressBalance = temp_balance - iota_amount;

								let addressToBeUpdated = {
									'type': 'remainder',
									'address': remainderAddress,
									'balance': remainderAddressBalance
								};
								addressesToBeUpdated.push(addressToBeUpdated);

								//add new address on db
								const insertNewAddressQuery = {
									// give the query a unique name
									name: 'insert-new-address',
									text: 'INSERT INTO addresses (address, telegram_sender_id, index, balance, security, used_as_input)' +
									'VALUES($1, $2, $3, $4, $5, $6)',
									values: [iota.utils.noChecksum(remainderAddress), id, index, remainderAddressBalance, 2, false]
								};

								await dbFunctions.executeQueryOnTransaction(client, insertNewAddressQuery, shouldAbort);

								index++;
							}

							if (DEBUG_VERBOSE) {
								Utils.printJSON(addressesToBeUpdated);
							}

							// after transaction
							for (let i = 0; i < addressesToBeUpdated.length; i++) {
								let updateAddress = {
									// give the query a unique name
									name: 'update-address-' + i,
									text: 'UPDATE addresses SET balance = $1, used_as_input = $2 WHERE address = $3',
									values: [0, true, addressesToBeUpdated[i].address]
								};

								await dbFunctions.executeQueryOnTransaction(client, updateAddress, shouldAbort);
							}

							let inputsArray = [];

							for (let i = 0; i < tempInputsArray.length; i++) {
								let input = {
									address: String(tempInputsArray[i].address),
									balance: Number(tempInputsArray[i].balance),
									keyIndex: Number(tempInputsArray[i].index),
									security: Number(tempInputsArray[i].security)
								};
								inputsArray.push(input);
							}

							const trytes = await iotaFunctions.prepareTransfer(
								iota,
								SEED,
								recipientAddress,
								iota_amount,
								Config.IOTA_MESSAGE,
								Config.TRANSACTION_TAG,
								remainderAddress,
								inputsArray
							);

							const tx = await iotaFunctions.sendTrytes(iota, trytes, Config.DEPTH, Config.MIN_WEIGHT_MAGNITUDE);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "success sendTrytes!");
								if (DEBUG_VERBOSE) {
									Utils.printJSON(tx);
								}
							}

							const t_bundle = tx[0].bundle;
							const t_hash = tx[0].hash;
							const t_timestamp = tx[0].attachmentTimestamp;

							const insertTXOnTXHistory = {
								// give the query a unique name
								name: 'insert-on-tx-history',
								text: 'INSERT INTO tx_history(tx_hash, telegram_sender_id, tx_bundle, tx_persistence, reattached, tx_attach_timestamp)' +
								'VALUES($1, $2, $3, $4, $5, $6)',
								values: [t_hash, id, t_bundle, false, 0, t_timestamp]
							};

							await dbFunctions.executeQueryOnTransaction(client, insertTXOnTXHistory, shouldAbort);

							const message = "DONATION SENT" +
								"\nYour donation of " + iota_amount + " IOTA is on the way!" +
								"\n\n > The bundle of your transaction is:" +
								"\n" + t_bundle +
								"\n\n > If you want to see your transaction confirmation status:\n" + THETAGLEORG_URL + t_bundle +
								"\n\n > If you want to speed up the confirmation: " + IOTAREATTACH_URL +
								"\n\nThank you for your support!" +
								"\n\nYou will receive the #KEY_" + keynum + ".";

							await bot.sendMessage(id, message);
							await bot.sendMessage(id, key_new);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
							}

							const saltkey_new = Config.getNewSalt();
							const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
							const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

							const updateESEEDForUserQuery = {
								// give the query a unique name
								name: 'create-new-wallet',
								text: 'UPDATE wallets SET seed = $1, next_index = $2, keynum = $3, hashedkey = $4, saltkey = $5 WHERE telegramid = $6',
								values: [eSEED_new, index, keynum, hashedkey_new, saltkey_new, id]
							};

							client.query(updateESEEDForUserQuery, (err, res) => {
								if (shouldAbort(err)) {
									return;
								}

								Utils.consoleLog("DB", functionName, "key updated!");

								client.query('COMMIT', (err) => {
									if (err) {
										console.error('Error committing transaction', err.stack)
									}

									bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

									done();
								})
							});
						} catch (e) {
							Utils.consoleLog("ERROR", functionName, e);

							let message = "DONATION FAILED" +
								"\nThere was an error performing your donation. ";

							if (e instanceof InvalidSeedException) {
								message += "\nThere was an error decrypting your SEED.";
							} else if (e instanceof InvalidAddressException) {
								message += "\nThe address you provided it is not valid.";
							} else if (e instanceof DatabaseException) {
								message += "\nThere was an error accessing to seed's addresses.";
							} else if (e instanceof AddressAlreadyUsedException) {
								message += "\nIt is possible that this recipient address has already been used. " +
									"For security reason provide another recipient address.";
							} else if (e instanceof AddressAlreadyUsedAsInputException) {
								message += "\nIt is possible that this recipient address has already been used as input. " +
									"For security reason provide another recipient address.";
							}

							message += "\nIf you want to retry: retype /donate." +
								"\n\nYou will receive the #KEY_" + keynum + ".";

							await bot.sendMessage(id, message);
							await bot.sendMessage(id, key_new);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
							}

							const saltkey_new = Config.getNewSalt();
							const hashedkey_new = hash.sha256().update(key_new + saltkey_new).digest('hex');
							const eSEED_new = String(CryptoJS.AES.encrypt(SEED, key_new));

							const updateESEEDForUserQuery = {
								// give the query a unique name
								name: 'create-new-wallet',
								text: 'UPDATE wallets SET seed = $1, keynum = $2, hashedkey = $3, saltkey = $4 WHERE telegramid = $5',
								values: [eSEED_new, keynum, hashedkey_new, saltkey_new, id]
							};

							client.query(updateESEEDForUserQuery, (err, res) => {
								if (shouldAbort(err)) {
									return;
								}

								Utils.consoleLog("DB", functionName, "key updated!");

								client.query('COMMIT', (err) => {
									if (err) {
										console.error('Error committing transaction', err.stack)
									}

									bot.sendMessage(id, " > #KEY_" + keynum + " is active!");

									done();
								})
							});
						}

					} catch (e) {
						if (e instanceof InvalidKeyException) {
							Utils.consoleLog("DEBUG", functionName, "User key is NOT valid!");

							done();

							return bot.sendMessage(id,
								"Wrong key, If you want to perform the payment: retype /donate " +
								"and send me the correct key.");
						}
					}
				});
			});
		});
	} else {
		await bot.sendMessage(id,
			"An error occurred waiting for the key, If you want to perform the payment retype /donate.");
	}
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
						Utils.consoleLog("DEBUG", functionName, "User hasn't a wallet");
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
							Utils.consoleLog("DEBUG", functionName, "User has a wallet");
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
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function insertNewSEED(client, id, done, shouldAbort, t_name, t_surname, t_username) {
	const functionName = "_insertNewSEED_";

	// a new SEED is created
	const SEED = Config.getNewSeed();

	try {
		// if SEED created is valid
		checkSeedValidity(SEED);

		if (DEBUG) {
			Utils.consoleLog("DEBUG", functionName, "SEED created");
		}

		const key = Config.getNewRandomKey();
		const saltkey = Config.getNewSalt();
		const hashedkey = hash.sha256().update(key + saltkey).digest('hex');
		const eSEED = String(CryptoJS.AES.encrypt(SEED, key));
		const keynum = 1;

		const insertNewSEEDForUserQuery = {
			// give the query a unique name
			name: 'create-new-wallet',
			text: 'INSERT INTO wallets(telegramid, telegram_username, seed, next_index, keynum, hashedkey, saltkey)' +
			'VALUES($1, $2, $3, $4, $5, $6, $7)',
			values: [id, t_username, eSEED, 0, keynum, hashedkey, saltkey]
		};

		const NewWalletUserStatus = {
			name: 'new-wallet-user-status',
			text: 'UPDATE userstatus SET status = $1 WHERE telegramid = $2',
			values: ['USER_WITH_WALLET', id]
		};

		let message = "Welcome to @IOTAWalletBot!" +
			"\n\n > A new SEED has been created just for you and has been associated with your Telegram ID." +
			"\n > The SEED of the wallet has been encrypted and only you can access to it providing the " +
			" encryption KEY." +
			"\n > At each interaction with your wallet the Bot will ask the last KEY to access your SEED. " +
			"Every time the SEED will be decrypted and then re-encrypted with a new random KEY." +
			"\n\n To know all available commands: /help or /help_help" +
			"\n\n (!) WARNING: the KEY is not stored in any form on the bot. If you lose it you will not " +
			"be able to access your wallet anymore!" +
			"\n (!) WARNING: NEVER DELETE WALLET CHAT HISTORY IN ORDER TO NEVER LOSE ANY KEY!" +
			"\n\nKEY" + keynum + ":";

		// send the key to the user
		await bot.sendMessage(id, message);
		await bot.sendMessage(id, key);

		if (DEBUG) {
			Utils.consoleLog("DEBUG", functionName, "User received key of encrypted SEED");
		}

		// if the user received the key, save everything into DB
		client.query(insertNewSEEDForUserQuery, (err, res) => {
			if (shouldAbort(err)) {
				return;
			}

			if (DEBUG) {
				Utils.consoleLog("DEBUG", functionName, "SEED saved in DB");
			}

			// set the user with the new status
			client.query(NewWalletUserStatus, (err, res) => {
				if (shouldAbort(err)) {
					return;
				}

				Utils.consoleLog("DB", functionName, "User state setted: USER_WITH_WALLET");

				client.query('COMMIT', async function (err) {
					if (err) {
						console.error('Error committing transaction', err.stack)
					}

					await bot.sendMessage(id, " > #KEY_1 is active!");
					done();
				})
			});
		});
	} catch (e) {
		if (e instanceof InvalidSeedException) {
			// error
			if (DEBUG) {
				Utils.consoleLog("ERROR", functionName, "invalid SEED");
			}

			// ROLLBACK
			client.query('ROLLBACK', (err) => {
				if (err) {
					console.error('Error rolling back client', err.stack)
				}

				// release the client back to the pool
				done()
			});
		}
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

// function for checking
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
