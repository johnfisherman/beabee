const express = require( 'express' );

const auth = require( __js + '/authentication' );
const { Members, ReferralGifts, RestartFlows } = require( __js + '/database' );
const mandrill = require( __js + '/mandrill' );
const { hasSchema } = require( __js + '/middleware' );
const { wrapAsync } = require( __js + '/utils' );

const config = require( __config );

const { processJoinForm, customerToMember, createJoinFlow, completeJoinFlow, createMember,
	startMembership, isGiftAvailable } = require( './utils' );

const { joinSchema, referralSchema, completeSchema } = require( './schemas.json' );

const app = express();

var app_config = {};

app.set( 'views', __dirname + '/views' );

app.use( function( req, res, next ) {
	res.locals.app = app_config;
	res.locals.activeApp = app_config.uid;
	next();
} );

app.get( '/' , function( req, res ) {
	res.render( 'index', { user: req.user } );
} );

app.get( '/referral/:code', wrapAsync( async function( req, res ) {
	const referrer = await Members.findOne( { referralCode: req.params.code.toUpperCase() } );
	if ( referrer ) {
		const gifts = await ReferralGifts.find();
		res.render( 'index', { user: req.user, referrer, gifts } );
	} else {
		req.flash('warning', 'referral-code-invalid');
		res.redirect( '/join' );
	}
} ) );

app.post( '/', [
	auth.isNotLoggedIn,
	hasSchema(joinSchema).orFlash
], wrapAsync(async function( req, res ) {
	const joinForm = processJoinForm(req.body);

	const completeUrl = config.audience + app.mountpath + '/complete';
	const redirectUrl = await createJoinFlow(completeUrl, joinForm);

	res.redirect( redirectUrl );
}));

app.post( '/referral/:code', [
	auth.isNotLoggedIn,
	hasSchema(joinSchema).orFlash,
	hasSchema(referralSchema).orFlash
], wrapAsync( async function ( req, res ) {
	const joinForm = processJoinForm(req.body);

	if (await isGiftAvailable(joinForm)) {
		const completeUrl = config.audience + app.mountpath + '/complete';
		const redirectUrl = await createJoinFlow(completeUrl, joinForm);
		res.redirect(redirectUrl);
	} else {
		req.flash('warning', 'referral-gift-invalid');
		res.redirect(req.originalUrl);
	}
} ) );

app.get( '/complete', [
	auth.isNotLoggedIn,
	hasSchema(completeSchema).orRedirect( '/join' )
], wrapAsync(async function( req, res ) {
	const {customerId, mandateId, joinForm} = await completeJoinFlow(req.query.redirect_flow_id);

	const memberObj = await customerToMember(customerId, mandateId);

	try {
		const newMember = await createMember(memberObj);
		await startMembership(newMember, joinForm);
		await mandrill.sendToMember('welcome', newMember);

		req.login(newMember, function ( loginError ) {
			if ( loginError ) {
				throw loginError;
			}
			res.redirect('/profile/complete');
		});
	} catch ( saveError ) {
		// Duplicate email
		if ( saveError.code === 11000 ) {
			const oldMember = await Members.findOne({email: memberObj.email});
			if (oldMember.gocardless.subscription_id) {
				res.redirect( app.mountpath + '/duplicate-email' );
			} else {
				const code = auth.generateCode();

				await RestartFlows.create( {
					code,
					member: oldMember._id,
					customerId,
					mandateId,
					joinForm
				} );

				await mandrill.sendToMember('restart-membership', oldMember, {code});

				res.redirect( app.mountpath + '/expired-member' );
			}
		} else {
			throw saveError;
		}
	}
}));

app.get('/restart/:code', wrapAsync(async (req, res) => {
	const restartFlow =
		await RestartFlows.findOneAndRemove({'code': req.params.code}).populate('member').exec();

	if (restartFlow) {
		const {member, customerId, mandateId, joinForm} = restartFlow;

		// Something has created a new subscription in the mean time!
		if (member.gocardless.subscription_id) {
			req.flash( 'danger', 'gocardless-subscription-exists' );
		} else {
			member.gocardless = {
				customer_id: customerId,
				mandate_id: mandateId
			};
			await member.save();

			await startMembership(member, joinForm);
			req.flash( 'success', 'gocardless-subscription-restarted' );
		}

		req.login(member, function ( loginError ) {
			if ( loginError ) {
				throw loginError;
			}
			res.redirect('/profile');
		});
	} else {
		req.flash( 'error', 'gocardless-subscription-restart-code-err' );
		res.redirect('/');
	}
}));

app.get('/expired-member', (req, res) => {
	res.render('expired-member');
});

app.get('/duplicate-email', (req, res) => {
	res.render('duplicate-email');
});

module.exports = function( config ) {
	app_config = config;
	return app;
};
