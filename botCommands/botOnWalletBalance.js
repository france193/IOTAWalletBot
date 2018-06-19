/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const iotaFunctions = require('../functions/iota');
const bitfinexFunctions = require('../functions/bitfinex');

/** constants **/
const iota = Config.iota;
const bot = Config.bot;
const Pool = Config.Pool;
const hash = Config.hash;
const CryptoJS = Config.CryptoJS;
const DEBUG = Settings.globalSettings.DEBUG;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;
const DEBUG_VERBOSE = Settings.globalSettings.DEBUG_VERBOSE;

/** export **/
const e = module.exports = {};

e.botOnWalletBalance = botOnWalletBalance;
e.botOnWalletBalanceAfterReceivingData = botOnWalletBalanceAfterReceivingData;

/** exceptions **/
const InvalidKeyException = require('../error/InvalidKeyException');
const CannotRetrieveWalletBalanceException = require('../error/CannotRetrieveWalletBalanceException');
const InvalidSeedException = require('../error/InvalidSeedException');

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

			Utils.checkUserStatusBeforePermittingActions(id, functionName, "WALLET_INFO");
		} else {
			await Utils.botUnavailable(id);
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
							Utils.checkEncryptionKey(hashedkey, key, saltkey);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "key is valid!");
							}

							await bot.sendMessage(id, "> #KEY received... processing...");

							// DECRYPT
							const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
							const SEED = bytes.toString(CryptoJS.enc.Utf8);

							Utils.checkSeedValidity(SEED);

							let price = await bitfinexFunctions.getPriceFromBitfinex();

							try {
								let balance = await iotaFunctions.getConfirmedBalance(iota, SEED);

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
							} else {
								Utils.consoleLog("ERROR", functionName, "error");
								Utils.printJSON(e);
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
