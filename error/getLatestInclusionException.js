/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

module.exports = class getLatestInclusionException extends Error {
	constructor(message) {
		super(message);
		this.name = 'getLatestInclusionException';
	}
};
