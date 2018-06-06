var __root = '../..';
var __src = __root + '/src';
var __js = __src + '/js';
var __config = __root + '/config';

var	express = require( 'express' ),
	app = express();

var passport = require( 'passport' );
var moment = require( 'moment' );

var PostcodesIO = require( 'postcodesio-client' ),
	postcodes = new PostcodesIO();

var Mail = require( __js + '/mail' );

var JoinFlows = require( __js + '/database' ).JoinFlows;
var Members = require( __js + '/database' ).Members;
var Permissions = require( __js + '/database' ).Permissions;

var auth = require( __js + '/authentication' );
var { hasSchema } = require( __js + '/middleware' );

var config = require( __config + '/config.json' );

var GoCardless = require( __js + '/gocardless' )( config.gocardless );

var app_config = {};

app.set( 'views', __dirname + '/views' );

app.use( function( req, res, next ) {
	res.locals.app = app_config;
	res.locals.activeApp = app_config.uid;
	next();
} );

app.get( '/' , auth.isNotLoggedIn, function( req, res ) {
	res.render( 'index' );
} );

const joinSchema = {
	body: {
		type: 'object',
		required: ['period', 'amount'],
		properties: {
			period: {
				type: 'string',
				enum: ['monthly', 'annually']
			},
		},
		oneOf: [
			{
				properties: {
					amount: { type: 'integer', minimum: 1 }
				}
			},
			{
				properties: {
					amount: { const: 'other' },
					amountOther: { type: 'integer', minimum: 1 }
				},
				required: ['amountOther']
			}
		]
	}
};

app.post( '/', [
	auth.isNotLoggedIn,
	hasSchema(joinSchema).orFlash
], function( req, res ) {
	const { body: { period, amount, amountOther } } = req;

	const amountNo = amount === 'other' ? parseInt(amountOther) : parseInt(amount);

	auth.generateActivationCode( function( sessionToken ) {
		const description =  `Membership: £${amountNo * (period === 'annually' ? 12 : 1)} ${period}`;

		GoCardless.createRedirectFlow(description, sessionToken, config.audience + app.mountpath + '/complete', function( error, redirect_url, body ) {
			if ( error ) {
				req.flash( 'danger', 'gocardless-mandate-err' );
				res.redirect( app.mountpath );
			} else {
				new JoinFlows({
					redirect_flow_id: body.redirect_flows.id,
					sessionToken, amount: amountNo, period
				}).save( function ( error ) {
					res.redirect( redirect_url );
				} );
			}
		} );
	} );
} );

const completeSchema = {
	query: {
		type: 'object',
		required: ['redirect_flow_id'],
		properties: {
			redirect_flow_id: {
				type: 'string'
			}
		}
	}
}

app.get( '/complete', [
	auth.isNotLoggedIn,
	hasSchema(completeSchema).or400
], async function( req, res ) {
	const { query: { redirect_flow_id } } = req;

	try {
		const { sessionToken, amount, period, actualAmount } =
			await JoinFlows.findOne({ redirect_flow_id });

		const permission = await Permissions.findOne( { slug: config.permission.member });

		const [ mandate_id, { redirect_flows } ] =
			await GoCardless.completeRedirectFlowPromise( redirect_flow_id, sessionToken );

		await JoinFlows.deleteOne({ redirect_flow_id });

		const customer = await GoCardless.getCustomerPromise( redirect_flows.links.customer );

		const member = new Members( {
			firstname: customer.given_name,
			lastname: customer.family_name,
			email: customer.email,
			delivery_optin: false,
			delivery_address: {
				line1: customer.address_line1,
				line2: customer.address_line2,
				city: customer.city,
				postcode: customer.postal_code
			},
			gocardless: {
				mandate_id
			},
			activated: true,
		} );

		await member.save();

		// TODO: handle case of duplicate email address

		const [ subscription_id ] =
			await GoCardless.createSubscriptionPromise( mandate_id, actualAmount, period,
				`Membership: £${actualAmount} ${period}`, {} );

		await member.update({$set: {
			'gocardless.subscription_id': subscription_id,
			'gocardless.amount': amount,
			'gocardless.period': period
		}, $push: {
			permissions: {
				permission: permission.id,
				date_added: new Date(),
				date_expires: moment.utc().add(config.gracePeriod).toDate()
			}
		}});

		req.login(member, function ( loginError ) {
			if ( loginError ) {
				throw loginError;
			}
			res.redirect('/profile/complete');
		});
	} catch ( error ) {
		req.log.error({
			app: 'join',
			action: 'complete',
			error
		});

		throw error;
	}
});

module.exports = function( config ) {
	app_config = config;
	return app;
};
