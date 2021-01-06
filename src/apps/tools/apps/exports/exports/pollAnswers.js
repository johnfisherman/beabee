const flat = require('flat');

const { PollAnswers, Polls } = require('@core/database');

async function getParams() {
	return [
		{
			name: 'pollId',
			label: 'Poll',
			type: 'select',
			values: (await Polls.find()).map(poll => [poll._id.toString(), poll.question])
		}
	];
}

async function getQuery({params: {pollId}}) {
	return {poll: pollId};
}

async function getExport(pollAnswers) {
	await PollAnswers.populate(pollAnswers, {path: 'member'});

	return pollAnswers.map(pollAnswer => {
		const member = pollAnswer.member || {};

		return {
			'First name': member.firstname,
			Surname: member.lastname,
			'Full name': member.fullname,
			'Email address': member.email,
			'Date': pollAnswer.createdAt,
			...flat(pollAnswer.answers)
		};
	});
}

module.exports = {
	name: 'Poll answers export',
	statuses: ['added', 'seen'],
	collection: PollAnswers,
	itemName: 'poll answers',
	getParams,
	getQuery,
	getExport
};