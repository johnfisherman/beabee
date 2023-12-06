import "module-alias/register";

import { In } from "typeorm";

import * as db from "@core/database";
import { log as mainLogger } from "@core/logging";

import EmailService from "@core/services/EmailService";
import NewsletterService from "@core/services/NewsletterService";
import ContactsService from "@core/services/ContactsService";
import SegmentService from "@core/services/SegmentService";

import Segment from "@models/Segment";
import SegmentOngoingEmail from "@models/SegmentOngoingEmail";
import SegmentContact from "@models/SegmentContact";

const log = mainLogger.child({ app: "process-segments" });

async function processSegment(segment: Segment) {
  log.info("Process segment " + segment.name);

  const matchedContacts = await SegmentService.getSegmentContacts(segment);

  const segmentContacts = (await db.getRepository(SegmentContact).find({
    where: { segmentId: segment.id },
    loadRelationIds: true
  })) as unknown as WithRelationIds<SegmentContact, "contact">[];

  const newContacts = matchedContacts.filter((m) =>
    segmentContacts.every((sm) => sm.contact !== m.id)
  );
  const oldSegmentContacts = segmentContacts.filter((sm) =>
    matchedContacts.every((m) => m.id !== sm.contact)
  );

  log.info(
    `Segment ${segment.name} has ${segmentContacts.length} existing contacts, ${newContacts.length} new contacts and ${oldSegmentContacts.length} old contacts`
  );

  await db.getRepository(SegmentContact).delete({
    segmentId: segment.id,
    contactId: In(oldSegmentContacts.map((sm) => sm.contact))
  });
  await db
    .getRepository(SegmentContact)
    .insert(newContacts.map((contact) => ({ segment, contact })));

  const outgoingEmails = await db.getRepository(SegmentOngoingEmail).find({
    where: { segmentId: segment.id },
    relations: ["email"]
  });

  // Only fetch old contacts if we need to
  const oldContacts =
    segment.newsletterTag ||
    outgoingEmails.some((oe) => oe.trigger === "onLeave")
      ? await ContactsService.findByIds(
          oldSegmentContacts.map((sm) => sm.contact)
        )
      : [];

  for (const outgoingEmail of outgoingEmails) {
    const emailContacts =
      outgoingEmail.trigger === "onLeave"
        ? oldContacts
        : outgoingEmail.trigger === "onJoin"
          ? newContacts
          : [];
    if (emailContacts.length > 0) {
      await EmailService.sendEmailToContact(outgoingEmail.email, emailContacts);
    }
  }

  if (segment.newsletterTag) {
    await NewsletterService.addTagToContacts(
      newContacts,
      segment.newsletterTag
    );
    await NewsletterService.removeTagFromContacts(
      oldContacts,
      segment.newsletterTag
    );
  }
}

async function main(segmentId?: string) {
  let segments: Segment[];
  if (segmentId) {
    const segment = await db
      .getRepository(Segment)
      .findOneBy({ id: segmentId });
    if (segment) {
      segments = [segment];
    } else {
      log.info(`Segment ${segmentId} not found`);
      return;
    }
  } else {
    segments = await db.getRepository(Segment).find();
  }

  for (const segment of segments) {
    await processSegment(segment);
  }
}

db.connect().then(async () => {
  try {
    await main(process.argv[2]);
  } catch (error) {
    log.error("Unexpected error", error);
  }
  await db.close();
});
