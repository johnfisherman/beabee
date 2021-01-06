const { Members } = require( '@core/database' );
const { default: PaymentService } = require( '@core/services/PaymentService' );

module.exports = [
	{
		name: 'Log in',
		run: async ( req ) => {
			const member = await Members.findOne( { email: req.specialUrl.email } ).populate( 'permissions.permission' );

			if (!member) {
				throw Error('Unknown member');
			}

			await new Promise( resolve => {
				req.login( member, () => {
					// Force session to be temporary
					req.session.cookie.expires = false;

					// TODO: remove this, currently copied from auth deserializeUser
					let permissions = [];
					// Loop through permissions check they are active right now and add those to the array
					for ( var p = 0; p < member.permissions.length; p++ ) {
						if ( member.permissions[p].date_added <= new Date() ) {
							if ( ! member.permissions[p].date_expires || member.permissions[p].date_expires > new Date() ) {
								permissions.push( member.permissions[p].permission.slug );
							}
						}
					}

					req.user.quickPermissions = permissions;

					resolve();

				} );
			} );

			return true;
		}
	},
	{
		name: 'Log out',
		run: async ( req ) => {
			if ( req.user ) {
				req.logout();
			}
			return true;
		}
	},
	{
		name: 'Change contribution',
		getParams: async () => [{
			name: 'amount',
			label: 'Amount',
			type: 'number'
		}, {
			name: 'isAbsolute',
			label: 'Absolute change?',
			type: 'boolean'
		}],
		run: async ( req, res, { amount, isAbsolute } ) => {
			if ( !req.user ) {
				res.redirect( '/login?next=' + req.originalUrl );
				return false;
			}

			if ( req.user.hasActiveSubscription && await PaymentService.canChangeContribution( req.user, true ) ) {
				await PaymentService.updateContribution(req.user, {
					amount: isAbsolute ? amount : req.user.contributionMonthlyAmount + amount,
					period: req.user.contributionPeriod,
					payFee: req.user.gocardless.paying_fee,
					prorate: false
				});
			} else {
				res.render( 'actions/cant-change-contribution' );
				return false;
			}

			return true;
		}
	},
	{
		name: 'Absorb fee',
		run: async ( req, res ) => {
			if ( !req.user ) {
				res.redirect( '/login?next=' + req.originalUrl );
				return false;
			}

			if ( req.user.hasActiveSubscription && await PaymentService.canChangeContribution( req.user, true ) ) {
				await PaymentService.updateContribution(req.user, {
					amount: req.user.contributionMonthlyAmount,
					period: req.user.contributionPeriod,
					payFee: true,
					prorate: false
				});
			} else {
				res.render( 'actions/cant-change-contribution' );
				return false;
			}

			return true;
		}
	},
	{
		name: 'Set tag',
		getParams: async () => [ {
			name: 'tagName',
			label: 'Tag',
			type: 'string'
		} ],
		run: async ( req, res, { tagName } ) => {
			if ( !req.user ) {
				res.redirect( '/login?next=' + req.originalUrl );
				return false;
			}

			await req.user.update( { $push: { tags: { name: tagName } } } );
			return true;
		}
	},
	{
		name: 'Set number of copies to deliver',
		getParams: async () => [ {
			name: 'copies',
			label: 'Number of copies',
			type: 'number'
		} ],
		run: async ( req, res, { copies } ) => {
			if ( !req.user ) {
				res.redirect( '/login?next=' + req.originalUrl );
				return false;
			}

			await req.user.update( { $set: { delivery_copies: copies } } );
			return true;
		}
	}
];