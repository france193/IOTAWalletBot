/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

/**
 * Functions:
 *
 * - retrieveAddresses
 * - executeQueryOnTransaction
 */

'use strict';

// to use common function
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const Config = require('../utilities/config');

const Client = Config.Client;

const DatabaseException = require('../error/DatabaseException');

// constants
const DEBUG = Settings.globalSettings.DEBUG;

// export
let e = module.exports = {};

e.retrieveAddresses = retrieveAddresses;
e.executeQueryOnTransaction = executeQueryOnTransaction;

/**
 * RETRIEVE ADDRESSES
 *
 * @param id - id that have those addresses
 *
 * @returns {Promise<any>}
 */
function retrieveAddresses(iota, id) {
	const functionName = "_retrieveAddresses_";

	return new Promise(function (resolve, reject) {
		const client = new Client(Config.clientSettings);

		client.connect();

		const retrieveAddress = {
			// give the query a unique name
			name: 'retrieve-addresses',
			text: 'SELECT * from addresses WHERE telegram_sender_id = $1 AND used_as_input = false;',
			values: [id]
		};

		client.query(retrieveAddress, (err, res) => {
			if (err) {
				reject(new DatabaseException(functionName + " - " + err));
			} else {
				if (DEBUG) {
					let addresses = [];

					res.rows.forEach(function (e) {
						let address = {
							'address': iota.utils.noChecksum(e.address),
							'index': e.index,
							'balance': e.balance,
							'security': e.security
						};

						addresses.push(address);
					});
					resolve(addresses);
				}
			}
		});
	});
}

/**
 * EXECUTE QUERY ON TRANSACTION
 *
 * @param client
 * @param queryToExecute
 * @param shouldAbort
 *
 * @returns {Promise<any>}
 */
function executeQueryOnTransaction(client, queryToExecute, shouldAbort) {
	const functionName = "_executeQueryOnTransaction_";

	return new Promise(function (resolve, reject) {
		client.query(queryToExecute, (err, res) => {
			if (shouldAbort(err)) {

			} else {
				Utils.consoleLog("DB", functionName, "Query executed!");
				resolve(res);
			}
		});
	});
}
