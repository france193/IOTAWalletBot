/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

/**
 * Functions:
 *
 * - getAddress
 * - getConfirmedBalance
 * - sendTrytes
 * - prepareTransfer
 * - getNodeInfo
 * - attachToTangle
 * - findTransactionObjects
 * - getLatestInclusion
 * - updateAddressesBalances
 */

// export
let e = module.exports = {};

e.getAddress = getAddress;
e.getConfirmedBalance = getConfirmedBalance;
e.sendTrytes = sendTrytes;
e.prepareTransfer = prepareTransfer;
e.getNodeInfo = getNodeInfo;
e.attachToTangle = attachToTangle;
e.findTransactionObjects = findTransactionObjects;
e.getLatestInclusion = getLatestInclusion;
e.updateAddressesBalances = updateAddressesBalances;

// to use common function
const Utils = require('../utilities/utils');
const Settings = require('../settings/settings');
const Config = require('../utilities/config');

const InvalidAddressException = require('../error/InvalidAddressException');
const InvalidSeedException = require('../error/InvalidSeedException');
const CannotRetrieveWalletBalanceException = require('../error/CannotRetrieveWalletBalanceException');
const InvalidHashException = require('../error/InvalidHashException');
const getLatestInclusionException = require('../error/getLatestInclusionException');
const findTransactionObjectsException = require('../error/findTransactionObjectsException');

// constants
const DEBUG = Settings.globalSettings.DEBUG;

/**
 * GET ADDRESS
 *
 * @param iota - iota instance for api
 * @param seed - seed from which retrieve address
 * @param index - specify index for a specific address or leave undefined
 *
 * @returns {Promise<any>}
 */
function getAddress(iota, seed, index) {
	const functionName = "_getAddressAsync_";

	return new Promise(function (resolve, reject) {
		// check seed
		if (!iota.valid.isAddress(seed)) {
			reject(new InvalidSeedException(functionName + " - Invalid seed!"));
		}

		// I want last address without provide index
		if (index === undefined) {
			iota.api.getNewAddress(seed, function (error, success) {
				if (error) {
					reject(new Error(functionName + " - " + error));
				} else {
					resolve(success);
				}
			});
		} else {
			// I want a specific address with an index
			if (isNaN(index)) {
				reject(new Error(functionName + " - Index is not a number!"));
			}

			const options = {
				"index": Number(index),
				"checksum": true,
				"total": 1,
				"security": 2,
				"returnAll": false
			};

			iota.api.getNewAddress(seed, options, function (error, success) {
				if (error) {
					reject(new Error(functionName + " - " + error));
				} else {
					resolve(success[0]);
				}
			});
		}
	});
}

/**
 * GET CONFIRMED BALANCE
 *
 * @param iota - iota instance for api
 * @param seed - seed from which retrieve address
 *
 * @returns {Promise<any>}
 */
function getConfirmedBalance(iota, seed) {
	const functionName = "_getConfirmedBalance_";

	return new Promise(function (resolve, reject) {
		// check seed
		if (!iota.valid.isAddress(seed)) {
			reject(new CannotRetrieveWalletBalanceException(functionName, "invalid Seed!"));
		}

		iota.api.getInputs(seed, function (error, success) {
			if (error) {
				reject(new CannotRetrieveWalletBalanceException(functionName, error));
			} else {
				resolve(success.totalBalance);
			}
		});
	});
}

/**
 * SEND TRYTES
 *
 * @param iota - iota instance for api
 * @param trytes - trytes to be sent
 * @param depth - depth value that determines how far to go for tip selection
 * @param min_weight_magnitude - minWeightMagnitude
 *
 * @returns {Promise<any>}
 */
function sendTrytes(iota, trytes, depth, min_weight_magnitude) {
	const functionName = "_sendTrytes_";

	return new Promise(function (resolve, reject) {
		if (!iota.valid.isArrayOfTrytes(trytes)) {
			reject(new Error(functionName + " - invalid Trytes!"));
		}

		iota.api.sendTrytes(trytes, depth, min_weight_magnitude, function (error, success) {
			if (error) {
				reject(new Error(functionName + " - " + error));
			} else {
				if (!iota.utils.isBundle(success)) {
					reject(new Error(functionName + " - invalid bundle!"));
				}

				resolve(success);
			}
		});
	});
}

/**
 * PREPARE TRANSFER
 *
 * @param iota - iota instance for api
 * @param seed - seed from which send transfer
 * @param recipientAddress - address in which send transfer
 * @param rawValue - value of IOTA to transfer
 * @param rawMessage - message of the transfer
 * @param rawTag - tag of the transfer
 * @param remainderAddress - address in which send back raminder IOTA or leave undefined
 * @param inputsArray - inputs from which take IOTA from the trasfer or leave undefined
 *
 * @returns {Promise<any>}
 */
function prepareTransfer(iota, seed, recipientAddress, rawValue, rawMessage, rawTag, remainderAddress, inputsArray) {
	const functionName = "_prepareTransfer_";

	return new Promise(function (resolve, reject) {
		const messageInTrytes = String(iota.utils.toTrytes(JSON.stringify(rawMessage)));
		const lengthMessageInTrytes = messageInTrytes.length;

		const tagInTrytes = rawTag;

		// check tag
		if (!iota.valid.isTrytes(tagInTrytes, Config.MAX_LENGTH_TAG)) {
			reject(new Error(functionName + " - invalid tagInTrytes!"));
		}

		// check message length
		if (lengthMessageInTrytes >= Config.MAX_LENGTH_MESSAGE) {
			reject(new Error(functionName + " - invalid lengthMessageInTrytes!"));
		}

		// check message
		if (!iota.valid.isTrytes(messageInTrytes, lengthMessageInTrytes)) {
			reject(new Error(functionName + " - invalid messageInTrytes!"));
		}

		// check value
		if (isNaN(rawValue)) {
			reject(new Error(functionName + " - invalid value of IOTA!"));
		}

		// check recipient address
		if (!iota.valid.isAddress(recipientAddress)) {
			reject(new InvalidAddressException(functionName + " - invalid recipientAddress!"));
		}

		// recipient address must be without checksum, just 81 trytes
		let transfersArray = [
			{
				"address": iota.utils.noChecksum(recipientAddress),
				"value": Number(rawValue),
				"message": String(messageInTrytes),
				"tag": String(tagInTrytes)
			}
		];

		if (!iota.valid.isTransfersArray(transfersArray)) {
			reject(new Error(functionName + " - invalid transfersArray!"));
		}

		// prepare options parameters
		let options = {
			'security': 2
		};

		// if there is, put remainder address
		if (remainderAddress !== undefined) {
			// check remainder address
			if (!iota.valid.isAddress(remainderAddress)) {
				reject(new InvalidAddressException(functionName + " - invalid remainderAddress!"));
			}

			options.address = iota.utils.noChecksum(remainderAddress);
		}

		// if there is, put inputs array
		if (inputsArray !== undefined) {
			// prepare transfer with inputs
			if (!iota.valid.isInputs(inputsArray)) {
				reject(new Error(functionName + " - invalid inputsArray!"));
			}

			options.inputs = inputsArray;
		}

		// prepare transfer to get trytes
		iota.api.prepareTransfers(seed, transfersArray, options, function (error, success) {
			if (error) {
				reject(new Error(functionName + " - " + error));
			} else {
				resolve(success);
			}
		});
	});
}

/**
 * GET NODE INFO
 *
 * @param iota - iota instance for api
 *
 * @returns {Promise<any>}
 */
function getNodeInfo(iota) {
	const functionName = "_getNodeInfo_";

	return new Promise(function (resolve, reject) {
		iota.api.getNodeInfo(function (error, success) {
			if (error) {
				reject(new Error(functionName + " - " + error));
			} else {
				resolve(success);
			}
		});
	});
}

/**
 * ATTACH TO TANGLE
 *
 * @param iota - iota instance for api
 * @param seed - seed from which send transfer
 * @param recipientAddress - address in which send transfer
 * @param depth - depth value that determines how far to go for tip selection
 * @param min_weight_magnitude - minWeightMagnitude
 *
 * @returns {Promise<any>}
 */
function attachToTangle(iota, seed, recipientAddress, depth, min_weight_magnitude) {
	const functionName = "_attachToTangle_";

	return new Promise(function (resolve, reject) {
		const tagInTrytes = Config.TRANSACTION_TAG;

		// check tag
		if (!iota.valid.isTrytes(tagInTrytes, Config.MAX_LENGTH_TAG)) {
			reject(new Error(functionName + " - invalid tagInTrytes!"));
		}

		// check seed
		if (!iota.valid.isAddress(seed)) {
			reject(new InvalidSeedException(functionName, "invalid Seed!"));
		}

		// check recipient address
		if (!iota.valid.isAddress(recipientAddress)) {
			reject(new InvalidAddressException(functionName + " - invalid recipientAddress!"));
		}

		// recipient address must be without checksum, just 81 trytes
		let transfersArray = [
			{
				"address": iota.utils.noChecksum(recipientAddress),
				"value": Number(0),
				"message": '',
				"tag": tagInTrytes
			}
		];

		if (!iota.valid.isTransfersArray(transfersArray)) {
			reject(new Error(functionName + " - invalid transfersArray!"));
		}

		// now you can start using all of the functions
		iota.api.sendTransfer(seed, depth, min_weight_magnitude, transfersArray, function (error, success) {
			if (error) {
				reject(new Error(functionName + " - " + error));
			} else {
				resolve(success);
			}
		});
	});
}

/**
 * FIND TRANSACTION OBJECT
 *
 * @param iota - iota instance for api
 * @param address - find transaction object for this address
 *
 * @returns {Promise<any>}
 */
function findTransactionObjects(iota, address) {
	const functionName = "_findTransactionObjects_";

	return new Promise(function (resolve, reject) {
		if (!iota.valid.isAddress(address)) {
			reject(new InvalidAddressException(functionName + " - Invalid address!"));
		}

		let searchValues = {
			'addresses': [iota.utils.noChecksum(address)]
		};

		iota.api.findTransactionObjects(searchValues, function (error, success) {
			if (error) {
				reject(new findTransactionObjectsException(functionName + " - " + error));
			} else {
				resolve(success);
			}
		});
	});
}

/**
 * GET LATEST INCLUSION
 *
 * @param iota
 * @param hash
 *
 * @returns {Promise<any>}
 */
function getLatestInclusion(iota, hash) {
	const functionName = "_getLatestInclusion_";

	return new Promise(function (resolve, reject) {
		if (!iota.valid.isHash(hash)) {
			reject(new InvalidHashException(functionName + " - Invalid hash!"));
		}

		let hashes = [
			hash
		];

		iota.api.getLatestInclusion(hashes, function (error, success) {
			if (error) {
				reject(new getLatestInclusionException(functionName + " - " + error));
			} else {
				resolve(success[0]);
			}
		});
	});
}

/**
 * UPDATE ADDRESSES BALANCES
 *
 * @param iota
 * @param addresses
 *
 * @returns {Promise<*>}
 */
async function updateAddressesBalances(iota, addresses) {
	const functionName = "_updateAddressesBalances_";

	for (let k = 0; k < addresses.length; k++) {
		try {
			let txObj = await findTransactionObjects(iota, addresses[k].address);

			// get confirmed & pending tx
			let confirmedTx = [];
			let pendingTx = [];
			for (let i = 0; i < txObj.length; i++) {
				let confirmation = await getLatestInclusion(iota, txObj[i].hash);

				if (txObj[i].value !== 0) {
					if (confirmation) {
						confirmedTx.push(txObj[i]);
					} else {
						pendingTx.push(txObj[i]);
					}
				}
			}

			let unconfirmedTxWithoutDuplicated = [];
			for (let i = 0; i < pendingTx.length; i++) {
				if (txNotConsidered(pendingTx[i], unconfirmedTxWithoutDuplicated)) {
					if (txNotConsidered(pendingTx[i], confirmedTx)) {
						unconfirmedTxWithoutDuplicated.push(pendingTx[i]);
						/*
						if (txNotConsidered(pendingTx[i], pendingTx)) {
							unconfirmedTxWithoutDuplicated.push(pendingTx[i]);
						}
						*/
					}
				}
			}

			// get confirmed balance
			let balance = 0;
			for (let i = 0; i < confirmedTx.length; i++) {
				balance += confirmedTx[i].value;
			}

			for (let i = 0; i < unconfirmedTxWithoutDuplicated.length; i++) {
				balance += unconfirmedTxWithoutDuplicated[i].value;
			}

			addresses[k].balance = balance;
		} catch (e) {
			console.log(e);
		}
	}

	return addresses;
}

function txNotConsidered(pendingTx, unconfirmedTxWithoutDuplicated) {
	for (let i = 0; i < unconfirmedTxWithoutDuplicated.length; i++) {
		if (unconfirmedTxWithoutDuplicated[i].bundle === pendingTx.bundle) {
			return false;
		}
	}
	return true;
}
