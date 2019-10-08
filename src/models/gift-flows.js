const mongoose = require( 'mongoose' );

module.exports = {
	name: 'GiftFlows',
	schema: mongoose.Schema( {
		date: {
			type: Date,
			required: true,
			default: Date.now
		},
		sessionId: {
			type: String,
			required: true
		},
		member: {
			type: mongoose.Schema.ObjectId,
			ref: 'Members'
		},
		giftForm: {
			firstname: {
				type: String,
				required: true
			},
			lastname: {
				type: String,
				required: true
			},
			email: {
				type: String,
				required: true
			},
			startDate: {
				type: Date,
				required: true
			},
			message: {
				type: String
			},
			fromName: {
				type: String,
				required: true
			},
			fromEmail: {
				type: String,
				required: true
			},
			delivery_address: {
				line1: String,
				line2: String,
				city: String,
				postcode: String
			}
		},
		completed: Boolean
	} )
};

module.exports.model = mongoose.model( module.exports.name, module.exports.schema );
