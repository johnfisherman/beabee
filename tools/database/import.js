global.__root = __dirname + '/../..';
global.__apps = __root + '/apps';
global.__config = __root + '/config/config.json';
global.__js = __root + '/src/js';
global.__models = __root + '/src/models';

const _ = require('lodash');
const EJSON = require('mongodb-extended-json');
const fs = require('fs');

const config = require( __config );
const db = require( __js + '/database' );
const importTypes = require('./types');

const modelsByName = _.fromPairs(importTypes.map(({model}) => [model.modelName, model]));

async function runImport({modelName, items}) {
	console.error(`Importing ${modelName}, got ${items.length} items`);
	const model = modelsByName[modelName];
	await model.deleteMany({});
	try {
		await model.collection.insertMany(items);
	} catch (err) {
		console.error(err);
	}
}

async function main(importData) {
	await Promise.all(importData.map(runImport));
}

if (!config.dev) {
	console.error('Can\'t import to live database');
	process.exit(1);
}

db.connect(config.mongo);

db.mongoose.connection.on('connected', () => {
	main(EJSON.parse(fs.readFileSync(process.argv[2])))
		.catch(err => console.error(err))
		.then(() => db.mongoose.disconnect());
});
