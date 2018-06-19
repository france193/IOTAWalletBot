/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const iotaFunctions = require('../functions/iota');
const dbFunctions = require('../functions/db');

/** constants **/
const iota = Config.iota;
const bot = Config.bot;
const Pool = Config.Pool;
const hash = Config.hash;
const CryptoJS = Config.CryptoJS;
const DEBUG = Settings.globalSettings.DEBUG;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;

/** export **/
const e = module.exports = {};

e.botOnGetAddress = botOnGetAddress;
e.botOnGetAddressAfterReceivingData = botOnGetAddressAfterReceivingData;

/** exceptions **/
const InvalidKeyException = require('../error/InvalidKeyException');
const InvalidSeedException = require('../error/InvalidSeedException');

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

			Utils.checkUserStatusBeforePermittingActions(id, functionName, "GET_NEW_ADDRESS");
		} else {
			await Utils.inputIsNotInInputsArray(id);
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
							Utils.checkEncryptionKey(hashedkey, key, saltkey);

							if (DEBUG) {
								Utils.consoleLog("DEBUG", functionName, "key is valid!");
							}

							await bot.sendMessage(id, "> #KEY received... processing...");

							// DECRYPT
							const bytes = CryptoJS.AES.decrypt(eSEED.toString(), key);
							const SEED = bytes.toString(CryptoJS.enc.Utf8);

							Utils.checkSeedValidity(SEED);

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

								Utils.checkAddressValidity(address);

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
