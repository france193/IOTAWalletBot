/*
 * Copyright (c) 2018 Francesco Longo All rights reserved.
 */

/** WEBHOOK SETTINGS:
 *
 * - SET WEBHOOK (SELF-SIGNED)
 * curl -F "url=<URL>" https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
 *
 * - SET WEBHOOK (SELF-SIGNED)
 * curl -F "url=<URL>" -F "certificate=@cert.pem" https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
 *
 * - UNSET WEBHOOK
 * curl -F "url=" https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
 * **/
const config_json = require('./config');

let clients = require('restify-clients');

let client = clients.createJsonClient({
	url: 'https://api.telegram.org/bot' + config_json.telegram.token,
	version: '~1.0'
});

let object;

if (config_json.telegram.webhook.isActive) {
	object = {
		url: 'https://www.france193.com',
		certificate: './Utilities/cert.pem'
	};
} else {
	object = {
		url: ''
	};
}

client.post('https://api.telegram.org/bot' + config_json.telegram.token + '/setWebhook', object, function (err, req, res, data) {
	console.log('%d -> %j', res.statusCode, res.headers);
	printJSON(data);
});

function printJSON(obj) {
	console.log(JSON.stringify(obj, null, "	"));
}
