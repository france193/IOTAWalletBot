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
const DEBUG_VERBOSE = Settings.globalSettings.DEBUG_VERBOSE;

/** export **/
const e = module.exports = {};

e.botOnDonate = botOnDonate;
e.botOnDonateAfterReceivingData = botOnDonateAfterReceivingData;

/** urls **/
const IOTASEARCH_URL = Settings.URLS.iotasearch;
const IOTAREATTACH_URL = Settings.URLS.iotareattach;
const THETAGLEORG_URL = Settings.URLS.thetangleorg;

/** exceptions **/
const InvalidKeyException = require('../error/InvalidKeyException');
const InvalidAddressException = require('../error/InvalidAddressException');
const InvalidSeedException = require('../error/InvalidSeedException');
const DatabaseException = require('../error/DatabaseException');
const AddressAlreadyUsedException = require('../error/AddressAlreadyUsedException');
const AddressAlreadyUsedAsInputException = require('../error/AddressAlreadyUsedAsInputException');

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

			Utils.checkUserStatusBeforePermittingActions(id, functionName, "DONATE");
		} else {
			await Utils.botUnavailable(id);
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
						Utils.checkSeedValidity(Settings.DONATION_SEED);
						const recipientAddress = await iotaFunctions.getAddress(iota, Settings.DONATION_SEED);

						Utils.checkEncryptionKey(hashedkey, key, saltkey);

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

							Utils.checkSeedValidity(SEED);

							Utils.checkAddressValidity(recipientAddress);

							//await Utils.checkAddressUsageAsInput(recipientAddress);

							// This bond is safer but much more stringent
							await Utils.checkAddressUsage(recipientAddress);

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
									let input = Utils.getAddresswithMinBalance(updatedAddresses);

									if (Utils.inputIsNotInInputsArray(input, tempInputsArray)) {
										tempInputsArray.push(input);

										temp_balance += input.balance;

										let addressToBeUpdated = {
											'type': 'input',
											'address': input.address
										};

										addressesToBeUpdated.push(addressToBeUpdated);
									}
								} else {
									throw new Error('My error: not enough balance');
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
