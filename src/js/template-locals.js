var __root = '../..';
var __src = __root + '/src';
var __js = __src + '/js';
var __config = __root + '/config';

var auth = require( __js + '/authentication' );

var config = require( __config + '/config.json' );

var moment = require( 'moment' );

var apps = [];

function templateLocals( req, res, next ) {
	// Process which apps should be shown in menu
	res.locals.apps = {
		main: [],
		secondary: []
	};
	res.locals.subapps = {};

	for ( var a in apps ) {
		var app = apps[a];
		if ( app.menu != "none" ) {
			if ( app.permissions !== undefined && app.permissions != [] ) {
				if ( req.user ) {
					for ( var p in app.permissions ) {
						if ( auth.checkPermission( req, app.permissions[p] ) ) {
							res.locals.apps[ app.menu ].push( app );
							break;
						}
					}
				} else {
					if ( app.permissions.indexOf( "loggedOut" ) != -1 )
						res.locals.apps[ app.menu ].push( app );
				}
				res.locals.subapps[ app.uid ] = [];
			}
			if ( app.subapps.length > 0 ) {
				for ( var s in app.subapps ) {
					var subapp = app.subapps[s];
					if ( subapp.hidden !== true ) {
						if ( subapp.permissions !== undefined && subapp.permissions != [] ) {
							if ( req.user ) {
								for ( var p in subapp.permissions ) {
									if ( auth.checkPermission( req, subapp.permissions[p] ) ) {
										res.locals.subapps[ app.uid ].push( subapp );
										break;
									}
								}
							}
						} else if ( req.user ) {
							res.locals.subapps[ app.uid ].push( subapp );
						}
					}
				}
			}
		}
	}

	// Template permissions
	res.locals.access = 'none';

	if ( req.user !== undefined && req.user.quickPermissions !== undefined ) {
		if ( req.user.quickPermissions.indexOf( 'member' ) != -1 ) res.locals.access = 'member';
		if ( req.user.quickPermissions.indexOf( config.permission.admin ) != -1 ) res.locals.access = 'admin';
		if ( req.user.quickPermissions.indexOf( 'superadmin' ) != -1 ) res.locals.access = 'superadmin';
		if ( req.user.quickPermissions.indexOf( config.permission.superadmin ) != -1 ) res.locals.access = 'superadmin';
	}

	// Delete login redirect URL if user navigates to anything other than the login page
	if ( req.originalUrl != '/login' )
		delete req.session.requestedUrl;

	// Check if user is setup
	res.locals.userSetup = true;
	if ( req.user !== undefined &&
		 (	req.user.emergency_contact.telephone === '' ||
			req.user.gocardless.mandate_id === '' ||
			req.user.gocardless.subscription_id === '' ||
			! req.user.discourse.activated ||
			req.user.discourse.username === ''
		) )
		res.locals.userSetup = false;

	// Load config + prepare breadcrumbs
	res.locals.config = config.globals;
	res.locals.usersname = config.globals.title;
	if ( req.user !== undefined ) res.locals.usersname = req.user.fullname;
	res.locals.breadcrumb = [];

	// Now
	res.locals.now = new Date();
	res.locals.moment = moment;

	next();
}

module.exports = function( a ) {
	apps = a;
	return templateLocals;
};
