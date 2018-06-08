/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

'use strict';

const states = [
	'NEW_USER',
	'USER_WITHOUT_WALLET',
	'USER_WITH_WALLET',
	'USER_RECEIVED_KEY',
	'USER_NOT_RECEIVED_KEY'
];

/** EXPORTS **/
let e = module.exports = {};

e.isValidStatus = function (state) {
	for(let i=0; i<states.length; i++) {
		if (states[i] === state) {
			return true;
		}
	}

	return false;
};
