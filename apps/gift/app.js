const express = require( 'express' );
const moment = require( 'moment' );

const config = require( '@config' );

const { GiftFlows, Members } = require( '@core/database' );
const { hasModel, hasSchema } = require( '@core/middleware' );
const stripe = require( '@core/stripe' );
const { loginAndRedirect, wrapAsync } = require( '@core/utils' );
const Options = require( '@core/options' )();

const { default: MembersService } = require( '@core/services/MembersService' );

const { processGiftFlow, isBeforeCutOff } = require('./utils');
const { createGiftSchema, updateGiftAddressSchema } = require( './schema.json' );

const app = express();
var app_config = {};

app.set( 'views', __dirname + '/views' );

app.use( function( req, res, next ) {
	res.locals.app = app_config;
	next();
} );

app.get( '/', ( req, res ) => {
	res.render( 'index', {
		stripePublicKey: config.stripe.public_key,
		isBeforeCutOff: isBeforeCutOff()
	} );
} );

async function createGiftFlow(giftForm, member) {
	try {
		return await GiftFlows.create({
			sessionId: 'UNKNOWN',
			setupCode: MembersService.generateMemberCode(giftForm),
			giftForm,
			member
		});
	} catch (saveError) {
		const {code, message} = saveError;
		if (code === 11000 && message.indexOf('setupCode') > -1) {
			return await createGiftFlow(giftForm, member);
		}
		throw saveError;
	}
}

app.post( '/', hasSchema( createGiftSchema ).orReplyWithJSON, wrapAsync( async ( req, res ) => {
	let error;

	const startDate = moment(req.body.startDate).endOf('day');
	if (startDate.isBefore()) {
		error = 'flash-gifts-date-in-the-past';
	} else {
		const member = await Members.findOne({email: req.body.email});
		if (member) {
			error = 'flash-gifts-email-duplicate';
		}
	}

	if (error) {
		res.status(400).send([Options.getText(error)]);
	} else {
		const giftFlow = await createGiftFlow(req.body, req.user);
		const isAnnual = req.body.type === '12';

		const session = await stripe.checkout.sessions.create({
			success_url: config.audience + '/gift/thanks/' + giftFlow._id,
			cancel_url: config.audience + '/gift',
			customer_email: req.body.fromEmail,
			payment_method_types: ['card'],
			line_items: [{
				name: 'Gift membership - ' + (isAnnual ? '12 months' : '6 months'),
				amount: isAnnual ? 3600 : 1800,
				currency: 'gbp',
				quantity: 1
			}]
		});

		await giftFlow.update({sessionId: session.id});

		res.send({sessionId: session.id});
	}
} ) );

app.get( '/:setupCode', hasModel(GiftFlows, 'setupCode'), wrapAsync( async ( req, res ) => {
	if (req.model.completed) {
		if (!req.model.processed) {
			await processGiftFlow(req.model, true);
		}

		const member = await Members.findOne({giftCode: req.params.setupCode});
		// Effectively expire this link once the member is set up
		if (member.setupComplete) {
			res.redirect('/login');
		} else {
			loginAndRedirect(req, res, member);
		}
	} else {
		res.redirect('/gift/failed/' + req.model._id);
	}
} ) );

app.get( '/thanks/:_id', hasModel(GiftFlows, '_id'),  ( req, res ) => {
	if (req.model.completed) {
		res.render('thanks', {
			...req.model.giftForm,
			processed: req.model.processed,
			isBeforeCutOff: isBeforeCutOff(req.model.date)
		});
	} else {
		res.redirect('/gift/failed/' + req.model._id);
	}
} );

app.post( '/thanks/:_id', [
	hasModel(GiftFlows, '_id'),
	hasSchema(updateGiftAddressSchema).orFlash
], wrapAsync( async ( req, res ) => {
	if (!req.model.processed && !req.model.giftForm.delivery_address.line1) {
		const {delivery_address, same_address, delivery_copies_address} = req.body;
		await req.model.update({$set: {
			'giftForm.delivery_address': delivery_address,
			'giftForm.delivery_copies_address': same_address ? delivery_address : delivery_copies_address
		}});
	}

	res.redirect( req.originalUrl );
} ) );

app.get( '/failed/:_id', hasModel(GiftFlows, '_id'), ( req, res ) => {
	if (req.model.completed) {
		res.redirect('/gift/thanks/' + req.model._id);
	} else {
		res.render('failed', {id: req.model._id});
	}
} );

module.exports = function( config ) {
	app_config = config;
	return app;
};
