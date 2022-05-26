import { differenceInMonths, format } from "date-fns";
import {
  SubscriptionIntervalUnit,
  PaymentCurrency,
  PaymentStatus as GCPaymentStatus
} from "gocardless-nodejs/types/Types";
import moment from "moment";

import { log as mainLogger } from "@core/logging";
import gocardless from "@core/lib/gocardless";
import { ContributionPeriod, getActualAmount, PaymentForm } from "@core/utils";

import { PaymentStatus } from "@models/Payment";

import config from "@config";

const log = mainLogger.child({ app: "gc-utils" });

function getChargeableAmount(paymentForm: PaymentForm): number {
  const actualAmount = getActualAmount(
    paymentForm.monthlyAmount,
    paymentForm.period
  );
  const chargeableAmount = paymentForm.payFee
    ? Math.floor((actualAmount / 0.99) * 100) + 20
    : actualAmount * 100;
  return Math.round(chargeableAmount); // TODO: fix this properly
}

async function getNextPendingPayment(query: Record<string, unknown>) {
  // We return the first pending payment we find, so there might be one with a
  // different status that has an earlier charge date, but for our purposes that
  // is fine and this can reduce API calls
  for (const status of [
    GCPaymentStatus.PendingSubmission,
    GCPaymentStatus.Submitted,
    // This one is unlikely so can go last to reduce API calls
    GCPaymentStatus.PendingCustomerApproval
  ]) {
    const payments = await gocardless.payments.list({
      status,
      limit: 1,
      sort_field: "charge_date",
      sort_direction: "asc",
      ...query
    });
    if (payments.length > 0) {
      return payments[0];
    }
  }
}
export async function getNextChargeDate(subscriptionId: string): Promise<Date> {
  const subscription = await gocardless.subscriptions.get(subscriptionId);
  const pendingPayment = await getNextPendingPayment({
    subscription: subscription.id,
    "charge_date[gte]": moment.utc().format("YYYY-MM-DD")
  });

  // Check for pending payments because subscription.upcoming_payments doesn't
  // include pending payments
  return moment
    .utc(
      pendingPayment
        ? pendingPayment.charge_date
        : subscription.upcoming_payments[0].charge_date
    )
    .add(config.gracePeriod)
    .toDate();
}

export async function createSubscription(
  mandateId: string,
  paymentForm: PaymentForm,
  _startDate?: Date
): Promise<string> {
  let startDate = _startDate && format(_startDate, "yyyy-MM-dd");
  const chargeableAmount = getChargeableAmount(paymentForm);
  log.info("Create subscription for " + mandateId, {
    paymentForm,
    startDate,
    chargeableAmount
  });

  if (startDate) {
    const mandate = await gocardless.mandates.get(mandateId);
    // next_possible_charge_date will always have a value as this is an active mandate
    if (startDate < mandate.next_possible_charge_date!) {
      startDate = mandate.next_possible_charge_date;
    }
  }

  const subscription = await gocardless.subscriptions.create({
    amount: chargeableAmount.toString(),
    currency: config.currencyCode.toUpperCase(),
    interval_unit:
      paymentForm.period === ContributionPeriod.Annually
        ? SubscriptionIntervalUnit.Yearly
        : SubscriptionIntervalUnit.Monthly,
    name: "Membership",
    links: {
      mandate: mandateId
    },
    ...(startDate && { start_date: startDate })
  });

  return subscription.id;
}

export async function updateSubscription(
  subscriptionId: string,
  paymentForm: PaymentForm
) {
  const chargeableAmount = getChargeableAmount(paymentForm);

  log.info(
    `Update subscription amount for ${subscriptionId} to ${chargeableAmount}`
  );

  await gocardless.subscriptions.update(subscriptionId, {
    amount: chargeableAmount.toString()
  });
}

export async function prorateSubscription(
  mandateId: string,
  renewalDate: Date,
  paymentForm: PaymentForm,
  lastMonthlyAmount: number
): Promise<boolean> {
  const monthsLeft = Math.max(0, differenceInMonths(renewalDate, new Date()));
  const prorateAmount =
    (paymentForm.monthlyAmount - lastMonthlyAmount) * monthsLeft;

  log.info("Prorate subscription for " + mandateId, {
    lastMonthlyAmount,
    paymentForm,
    monthsLeft,
    prorateAmount
  });

  if (prorateAmount >= 0) {
    // Amounts of less than 1 can't be charged, just ignore them
    if (prorateAmount < 1) {
      return true;
    } else if (paymentForm.prorate) {
      await gocardless.payments.create({
        amount: Math.floor(prorateAmount * 100).toFixed(0),
        currency: config.currencyCode.toUpperCase() as PaymentCurrency,
        // TODO: i18n description: "One-off payment to start new contribution",
        links: {
          mandate: mandateId
        }
      });
      return true;
    }
  }

  return false;
}

export async function hasPendingPayment(mandateId: string): Promise<boolean> {
  return !!(await getNextPendingPayment({ mandate: mandateId }));
}

export function convertStatus(status: GCPaymentStatus): PaymentStatus {
  switch (status) {
    case GCPaymentStatus.PendingCustomerApproval:
    case GCPaymentStatus.PendingSubmission:
    case GCPaymentStatus.Submitted:
      return PaymentStatus.Pending;

    case GCPaymentStatus.Confirmed:
    case GCPaymentStatus.PaidOut:
      return PaymentStatus.Successful;

    case GCPaymentStatus.Failed:
    case GCPaymentStatus.CustomerApprovalDenied:
      return PaymentStatus.Failed;

    case GCPaymentStatus.Cancelled:
    case GCPaymentStatus.ChargedBack:
      return PaymentStatus.Cancelled;
  }
}
