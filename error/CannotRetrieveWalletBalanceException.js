/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

module.exports = class CannotRetrieveWalletBalanceException extends Error {
	constructor(message, cause) {
		super(message);
		this.cause = cause;
		this.name = 'CannotRetrieveWalletBalanceException';
	}
};
