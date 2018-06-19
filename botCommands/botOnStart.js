/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';


/** require **/
const Config = require('../utilities/config');
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');

/** constants **/
const bot = Config.bot;
const Pool = Config.Pool;
const hash = Config.hash;
const CryptoJS = Config.CryptoJS;
const DEBUG = Settings.globalSettings.DEBUG;
const PUBLIC_BOT = Settings.globalSettings.PUBLIC_BOT;

/** exceptions **/
const InvalidSeedException = require('../error/InvalidSeedException');

/** export **/
const e = module.exports = {};

e.botOnStart = botOnStart;

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
			await Utils.botUnavailable(id);
		}
	} catch (e) {
		Utils.consoleLog("ERROR", functionName, e);
		Utils.consoleLog("ERROR", functionName, e);
	}
}

async function insertNewSEED(client, id, done, shouldAbort, t_name, t_surname, t_username) {
	const functionName = "_insertNewSEED_";

	// a new SEED is created
	const SEED = Config.getNewSeed();

	try {
		// if SEED created is valid
		Utils.checkSeedValidity(SEED);

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
