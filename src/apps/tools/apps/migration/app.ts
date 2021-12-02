import express from "express";
import { getRepository } from "typeorm";

import { isAdmin } from "@core/middleware";
import { ContributionPeriod, ContributionType, wrapAsync } from "@core/utils";

import EmailService from "@core/services/EmailService";
import MembersService from "@core/services/MembersService";

import ResetPasswordFlow from "@models/ResetPasswordFlow";

import { schemaToEmail } from "@apps/tools/apps/emails/app";

import config from "@config";

const app = express();

app.set("views", __dirname + "/views");

app.use(isAdmin);

app.get("/", (req, res) => {
  res.render("index");
});

async function getManualMembers() {
  const manualMembers = await MembersService.find({
    where: { contributionType: ContributionType.Manual }
  });

  const activeMembers = manualMembers.filter((m) => m.isActiveMember);

  const expiringMembers = activeMembers.filter((m) => m.membershipExpires);

  const nonExpiringMonthlyMembers = activeMembers.filter(
    (member) =>
      member.contributionPeriod === ContributionPeriod.Monthly &&
      !member.membershipExpires
  );

  const nonExpiringAnnualMembers = activeMembers.filter(
    (member) =>
      member.contributionPeriod === ContributionPeriod.Annually &&
      !member.membershipExpires
  );

  return {
    expiringMembers,
    nonExpiringMonthlyMembers,
    nonExpiringAnnualMembers
  };
}

app.get(
  "/manual-to-gc",
  wrapAsync(async (req, res) => {
    const {
      expiringMembers,
      nonExpiringMonthlyMembers,
      nonExpiringAnnualMembers
    } = await getManualMembers();

    res.render("manual-to-gc", {
      expiringMembers: expiringMembers.length,
      nonExpiringMonthlyMembers: nonExpiringMonthlyMembers.length,
      nonExpiringAnnualMembers: nonExpiringAnnualMembers.length
    });
  })
);

app.post(
  "/manual-to-gc",
  wrapAsync(async (req, res) => {
    const { expiringMembers, nonExpiringMonthlyMembers } =
      await getManualMembers();

    const convertableMembers = [
      ...expiringMembers,
      ...nonExpiringMonthlyMembers
    ];

    const rpFlows = await getRepository(ResetPasswordFlow).insert(
      convertableMembers.map((member) => ({ member }))
    );

    const email = schemaToEmail({ ...req.body, name: "" });

    const recipients = convertableMembers.map((member, i) =>
      EmailService.memberToRecipient(member, {
        CONVERTLINK: `${config.audience}/auth/set-password/${
          rpFlows.identifiers[i].id
        }?next=${encodeURIComponent("/profile/contribution")}`
      })
    );

    await EmailService.sendEmail(email, recipients);

    res.redirect("/tools/migration/manual-to-gc");
  })
);

export default app;