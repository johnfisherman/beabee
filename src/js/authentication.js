var __home = __dirname + "/../..";
var __config = __home + '/config/config.json';
var __src = __home + '/src';
var __js = __src + '/js';

var config = require( __config );

var db = require( __js + '/database' ),
	Permissions = db.Permissions,
	Members = db.Members,
	APIKeys = db.APIKeys;

var passport = require( 'passport' ),
	LocalStrategy = require( 'passport-local' ).Strategy;

var crypto = require( 'crypto' );

var messages = require( __src + '/messages.json' );

var Authentication = {
	auth: function( app ) {
		// Add support for local authentication
		passport.use( new LocalStrategy( {
			usernameField: 'email'
		}, function( email, password, done ) {
				Members.findOne( { email: email }, function( err, user ) {
					if ( user !== null ) {
						if ( user.password.tries >= config['password-tries'] ) {
							return done( null, false, { message: messages['account-locked'] } );
						}

						Authentication.hashPassword( password, user.password.salt, function( hash ) {
							if ( hash == user.password.hash ) {
								if ( ! ( user.activated || Authentication.superAdmin( user.email ) ) ) {
									return done( null, false, { message: messages['inactive-account'] } );
								}

								if ( user.password.reset_code !== null ) {
									user.password.reset_code = null;
									user.save( function ( err ) {} );
									return done( null, { _id: user._id }, { message: messages['password-reset-attempt'] } );
								}

								if ( user.password.tries > 0 ) {
									var attempts = user.password.tries;
									user.password.tries = 0;
									user.save( function ( err ) {} );
									return done( null, { _id: user._id }, { message: messages['account-attempts'].replace( '%', attempts ) } );
								}
								return done( null, { _id: user._id }, { message: messages['logged-in'] } );
							} else {
								user.password.tries++;
								user.save( function ( err ) {} );
								return setTimeout( function() { return done( null, false, { message: messages['login-failed'] } ); }, 1000 );
							}
						} );
					} else {
						return setTimeout( function() { return done( null, false, { message: messages['login-failed'] } ); }, 1000 );
					}
				} );
			}
		) );

		passport.serializeUser( function( data, done ) {
			done( null, data );
		} );

		passport.deserializeUser( function( data, done ) {
			Members.findById( data._id ).populate( 'permissions.permission' ).exec( function( err, user ) {
				if ( user !== null ) {
					var permissions = [ 'loggedIn' ];

					user.last_seen = new Date();
					user.save( function( err ) {} );

					if ( Authentication.superAdmin( user.email ) )
						permissions.push( 'superadmin' );

					for ( var p = 0; p < user.permissions.length; p++ ) {
						if ( user.permissions[p].date_added <= new Date() ) {
							if ( user.permissions[p].date_expires === undefined || user.permissions[p].date_expires > new Date() ) {
								permissions.push( user.permissions[p].permission.slug );
							}
						}
					}

					user.quickPermissions = permissions;
					user.setup = false;
					if ( user.emergency_contact.telephone ||
						 user.gocardless.mandate_id === '' ||
						 user.gocardless.subscription_id === '' ||
						 ! user.discourse.activated ||
						 user.discourse.username === '' ||
						 user.tag.id === '' )
						user.setup = true;
					return done( null, user );
				} else {
					return done( null, false, { message: messages['login-required'] } );
				}
			} );
		} );

		// Include support for passport and sessions
		app.use( passport.initialize() );
		app.use( passport.session() );
	},
	generateActivationCode: function( callback ) {
		crypto.randomBytes( 10, function( ex, code ) {
			callback( code.toString( 'hex' ) );
		} );
	},
	generateSalt: function( callback ) {
		crypto.randomBytes( 256, function( ex, salt ) {
			callback( salt.toString( 'hex' ) );
		} );
	},
	hashPassword: function( password, salt, callback ) {
		crypto.pbkdf2( password, salt, 1000, 512, 'sha512', function( err, hash ) {
			callback( hash.toString( 'hex' ) );
		} );
	},
	generatePassword: function( password, callback ) {
		Authentication.generateSalt( function( salt ) {
			Authentication.hashPassword( password, salt, function( hash ) {
				callback( {
					salt: salt,
					hash: hash
				} );
			} );
		} );
	},
	superAdmin: function( email ) {
		if ( config.superadmins.indexOf( email ) != -1 ) {
			return true;
		}
		return false;
	},
	loggedIn: function( req ) {
		// Is the user logged in?
		if ( req.isAuthenticated() && req.user !== undefined ) {
			// Is the user active
			if ( req.user.activated || Authentication.superAdmin( req.user.email ) ) {
				return true;
			} else {
				return -1;
			}
		} else {
			return false;
		}
	},
	activeMember: function( req ) {
		// Check user is logged in
		var status = Authentication.loggedIn( req );
		if ( ! status ) {
			return status;
		} else {
			if ( Authentication.checkPermission( req, 'member' ) ) return true;
			if ( Authentication.checkPermission( req, 'superadmin' ) ) return true;
			if ( Authentication.checkPermission( req, 'admin' ) ) return true;
			if ( Authentication.superAdmin( req.user.email ) ) return true;
		}
		return -2;
	},
	canAdmin: function( req ) {
		// Check user is logged in
		var status = Authentication.loggedIn( req );
		if ( ! status ) {
			return status;
		} else {
			if ( Authentication.checkPermission( req, 'superadmin' ) ) return true;
			if ( Authentication.checkPermission( req, 'admin' ) ) return true;
			if ( Authentication.superAdmin( req.user.email ) ) return true;
		}
		return -3;
	},
	canSuperAdmin: function( req ) {
		// Check user is logged in
		var status = Authentication.loggedIn( req );
		if ( ! status ) {
			return status;
		} else {
			if ( Authentication.checkPermission( req, 'superadmin' ) ) return true;
			if ( Authentication.superAdmin( req.user.email ) ) return true;
		}
		return -3;
	},
	checkPermission: function( req, permission ) {
		if ( req.user === undefined ) return false;
		if ( permission == 'superadmin' ) {
			if ( req.user.quickPermissions.indexOf( config.permission.superadmin ) != -1 ) return true;
			return false;
		}
		if ( permission == 'admin' ) {
			if ( req.user.quickPermissions.indexOf( config.permission.admin ) != -1 ) return true;
			return false;
		}
		if ( req.user.quickPermissions.indexOf( permission ) != -1 ) return true;
		return false;
	},
	isLoggedIn: function( req, res, next ) {
		var status = Authentication.loggedIn( req );
		switch ( status ) {
			case true:
				return next();
			case -1:
				req.flash( 'warning', messages['inactive-account'] );
				res.redirect( '/' );
				return;
			default:
			case false:
				if ( req.method == 'GET' ) req.session.requestedUrl = req.originalUrl;
				req.flash( 'error', messages['login-required'] );
				res.redirect( '/login' );
				return;
		}
	},
	isAPIAuthenticated: function( req, res, next ) {
		if ( req.query.api_key === undefined ) return res.sendStatus( 403 );
		APIKeys.findOne( { key: req.query.api_key }, function( err, key ) {
			if ( key !== undefined ) return next();
			return res.sendStatus( 403 );
		} );
	},
	isMember: function( req, res, next ) {
		var status = Authentication.activeMember( req );
		switch ( status ) {
			case true:
				return next();
			case -1:
				req.flash( 'warning', messages['inactive-account'] );
				res.redirect( '/' );
				return;
			case -2:
				req.flash( 'warning', messages['inactive-membership'] );
				res.redirect( '/profile' );
				return;
			default:
			case false:
				if ( req.method == 'GET' ) req.session.requestedUrl = req.originalUrl;
				req.flash( 'error', messages['login-required'] );
				res.redirect( '/login' );
				return;
		}
	},
	isAdmin: function( req, res, next ) {
		var status = Authentication.canAdmin( req );
		switch ( status ) {
			case true:
				return next();
			case -1:
				req.flash( 'warning', messages['inactive-account'] );
				res.redirect( '/' );
				return;
			case -2:
				req.flash( 'warning', messages['inactive-membership'] );
				res.redirect( '/profile' );
				return;
			case -3:
				req.flash( 'warning', messages['403'] );
				res.redirect( '/profile' );
				return;
			default:
			case false:
				if ( req.method == 'GET' ) req.session.requestedUrl = req.originalUrl;
				req.flash( 'error', messages['login-required'] );
				res.redirect( '/login' );
				return;
		}
	},
	isSuperAdmin: function( req, res, next ) {
		var status = Authentication.canSuperAdmin( req );
		switch ( status ) {
			case true:
				return next();
			case -1:
				req.flash( 'warning', messages['inactive-account'] );
				res.redirect( '/' );
				return;
			case -2:
				req.flash( 'warning', messages['inactive-membership'] );
				res.redirect( '/profile' );
				return;
			case -3:
				req.flash( 'warning', messages['403'] );
				res.redirect( '/profile' );
				return;
			default:
			case false:
				if ( req.method == 'GET' ) req.session.requestedUrl = req.originalUrl;
				req.flash( 'error', messages['login-required'] );
				res.redirect( '/login' );
				return;
		}
	},
	hashCard: function( id ) {
		var md5 = crypto.createHash( 'md5' );
		md5.update( config.tag_salt );
		md5.update( id.toLowerCase() );
		return md5.digest( 'hex' );
	},
	passwordRequirements: function( password ) {
		if ( password.length < 8 )
			return messages['password-err-length'];

		if ( password.match( /\d/g ) === null )
			return messages['password-err-number'];

		if ( password.match( /[A-Z]/g ) === null )
			return messages['password-err-letter-up'];

		if ( password.match( /[a-z]/g ) === null )
			return messages['password-err-letter-low'];

		return true;
	}
};

module.exports = Authentication;
