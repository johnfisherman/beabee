import { differenceInMonths, subMonths } from "date-fns";
import Stripe from "stripe";

import stripe from "@core/lib/stripe";
import { log as mainLogger } from "@core/logging";
import { ContributionPeriod, PaymentForm, PaymentMethod } from "@core/utils";
import { getChargeableAmount } from "@core/utils/payment";

import config from "@config";

const log = mainLogger.child({ app: "stripe-utils" });

function getPriceData(
  paymentForm: PaymentForm,
  paymentMethod: PaymentMethod
): Stripe.SubscriptionCreateParams.Item.PriceData {
  return {
    currency: config.currencyCode,
    product: config.stripe.membershipProductId,
    recurring: {
      interval:
        paymentForm.period === ContributionPeriod.Monthly ? "month" : "year"
    },
    unit_amount: getChargeableAmount(paymentForm, paymentMethod)
  };
}

export async function createSubscription(
  customerId: string,
  paymentForm: PaymentForm,
  paymentMethod: PaymentMethod,
  startDate?: Date
): Promise<Stripe.Subscription> {
  log.info("Creating subscription on " + customerId, {
    paymentForm,
    startDate
  });

  return await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price_data: getPriceData(paymentForm, paymentMethod) }],
    off_session: true,
    ...(startDate && {
      billing_cycle_anchor: Math.floor(+startDate / 1000),
      proration_behavior: "none"
    })
  });
}

const SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;

export async function updateSubscription(
  subscriptionId: string,
  paymentForm: PaymentForm,
  paymentMethod: PaymentMethod
): Promise<{ subscription: Stripe.Subscription; startNow: boolean }> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["schedule"]
  });

  const renewalDate = new Date(subscription.current_period_end * 1000);
  const monthsLeft = Math.max(0, differenceInMonths(renewalDate, new Date()));
  // Calculate exact number of seconds to remove (rather than just "one month")
  // as this aligns with Stripe's calculations
  const prorationTs = Math.floor(
    +renewalDate / 1000 - SECONDS_IN_A_YEAR * (monthsLeft / 12)
  );

  const priceData = getPriceData(paymentForm, paymentMethod);
  const subscriptionItems = [
    {
      id: subscription.items.data[0].id,
      price_data: priceData
    }
  ];

  const invoice = await stripe.invoices.retrieveUpcoming({
    subscription: subscriptionId,
    subscription_items: subscriptionItems,
    subscription_proration_date: prorationTs
  });

  const wouldProrate = invoice.lines.data.some((item) => item.proration);

  log.info("Preparing update subscription for " + subscriptionId, {
    renewalDate,
    prorationDate: new Date(prorationTs * 1000),
    wouldProrate,
    paymentForm
  });

  const startNow = !wouldProrate || paymentForm.prorate;

  const oldSchedule =
    subscription.schedule as Stripe.SubscriptionSchedule | null;
  if (
    oldSchedule?.status === "active" ||
    oldSchedule?.status === "not_started"
  ) {
    log.info(`Releasing schedule ${oldSchedule.id} for ${subscription.id}`);
    await stripe.subscriptionSchedules.release(oldSchedule.id);
  }

  if (startNow) {
    log.info(`Updating subscription for ${subscription.id}`);
    await stripe.subscriptions.update(subscriptionId, {
      items: subscriptionItems,
      ...(paymentForm.prorate
        ? {
            proration_behavior: "always_invoice",
            proration_date: prorationTs
          }
        : {
            proration_behavior: "none"
          })
    });
  } else {
    log.info(`Creating new schedule for ${subscription.id}`);
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id
    });

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          start_date: schedule.phases[0].start_date,
          end_date: schedule.phases[0].end_date,
          items: [{ price: schedule.phases[0].items[0].price as string }]
        },
        {
          start_date: schedule.phases[0].end_date,
          items: [{ price_data: priceData }]
        }
      ]
    });
  }

  return { subscription, startNow };
}

export function paymentMethodToType(
  method: PaymentMethod
): Stripe.PaymentMethod.Type {
  switch (method) {
    case PaymentMethod.StripeCard:
      return "card";
    case PaymentMethod.StripeSEPA:
      return "sepa_debit";
    default:
      throw new Error("Unexpected payment method");
  }
}
