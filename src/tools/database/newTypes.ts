import crypto from 'crypto';
import { EntityTarget } from 'typeorm';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Chance } from 'chance';

import Payment from '@models/Payment';
import GiftFlow, { GiftForm } from '@models/GiftFlow';
import Referral from '@models/Referral';
import ReferralGift from '@models/ReferralGift';
import Export from '@models/Export';
import ExportItem from '@models/ExportItem';
import Email from '@models/Email';
import Notice from '@models/Notice';
import Option from '@models/Option';
import PageSettings from '@models/PageSettings';

export type DrierMap<T> = {[K in WritableKeysOf<T>]?: ((prop: T[K]) => T[K])|Drier<T[K]>};

export interface Drier<T> {
	model: EntityTarget<T>
	modelName: string
	propMap: DrierMap<T>
}

export interface NewModelData<T> {
	items: T[]
	modelName: string
}

function createDrier<T>(
	model: EntityTarget<T>,
	modelName: string,
	propMap: DrierMap<T> = {},
): Drier<T> {
	return {model, modelName, propMap};
}

// Property generators

function randomId(len: number, prefix?: string) {
	return () => (prefix || '') + crypto.randomBytes(6).toString('hex').slice(0, len).toUpperCase();
}

let codeNo = 0;
function uniqueCode(): string {
	codeNo++;
	const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(codeNo / 1000)];
	const no = codeNo % 1000;
	return letter.padStart(2, 'A') + (no + '').padStart(3, '0');
}

const objectId = () => new mongoose.Types.ObjectId().toString();

const chance = new Chance();

// Model driers

const emailDrier = createDrier(Email, 'emails');
const exportsDrier = createDrier(Export, 'exports');
const noticesDrier = createDrier(Notice, 'notices');
const optionsDrier = createDrier(Option, 'options');
const pageSettingsDrier = createDrier(PageSettings, 'pageSettings');

const exportItemsDrier = createDrier(ExportItem, 'exportItems', {
	itemId: itemId => itemId // These will be mapped to values that have already been seen
});

const giftFlowDrier = createDrier(GiftFlow, 'giftFlow', {
	id: () => uuidv4(),
	setupCode: uniqueCode,
	sessionId: randomId(12),
	giftForm: createDrier(GiftForm, 'giftForm', {
		firstname: () => chance.first(),
		lastname: () => chance.last(),
		email: () => chance.email(),
		message: () => chance.sentence(),
		fromName: () => chance.name(),
		fromEmail: () => chance.email()
	})
});

const paymentsDrier = createDrier(Payment, 'payments', {
	id: () => uuidv4(),
	paymentId: randomId(12, 'PM'),
	subscriptionId: randomId(12, 'SB'),
	memberId: objectId
});

const referralsGiftDrier = createDrier(ReferralGift, 'referralgifts', {
	stock: stock => stock // Add to map so it is serialised correctly
});

const referralsDrier = createDrier(Referral, 'referrals', {
	id: () => uuidv4(),
	referrerId: objectId,
	refereeId: objectId
});

export default [
	emailDrier,
	exportsDrier,
	giftFlowDrier,
	noticesDrier,
	optionsDrier,
	paymentsDrier,
	pageSettingsDrier,
	referralsGiftDrier, // Must be before referralsDrier
	referralsDrier,
	exportItemsDrier // Must be after all exportable items
] as Drier<any>[];