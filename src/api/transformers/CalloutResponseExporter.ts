import {
  Paginated,
  RoleType,
  getCalloutComponents,
  stringifyAnswer
} from "@beabee/beabee-common";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { In, SelectQueryBuilder } from "typeorm";

import { getRepository } from "@core/database";

import { GetExportQuery } from "@api/dto/BaseDto";
import {
  ExportCalloutResponseDto,
  ExportCalloutResponsesOptsDto
} from "@api/dto/CalloutResponseDto";
import { BaseCalloutResponseTransformer } from "@api/transformers/BaseCalloutResponseTransformer";
import NotFoundError from "@api/errors/NotFoundError";
import { groupBy } from "@api/utils";

import CalloutResponse from "@models/CalloutResponse";
import CalloutResponseComment from "@models/CalloutResponseComment";
import Callout from "@models/Callout";

import { AuthInfo } from "@type/auth-info";

class CalloutResponseExporter extends BaseCalloutResponseTransformer<
  ExportCalloutResponseDto,
  ExportCalloutResponsesOptsDto
> {
  protected allowedRoles: RoleType[] = ["admin"];

  convert(
    response: CalloutResponse,
    opts: ExportCalloutResponsesOptsDto
  ): ExportCalloutResponseDto {
    const contact: [string, string, string, string] = response.contact
      ? [
          response.contact.firstname,
          response.contact.lastname,
          response.contact.fullname,
          response.contact.email
        ]
      : ["", "", response.guestName || "", response.guestEmail || ""];

    return [
      response.createdAt.toISOString(),
      response.number,
      response.bucket,
      response.tags.map((rt) => rt.tag.name).join(", "),
      response.assignee?.email || "",
      ...contact,
      !response.contact,
      response.comments?.map(commentText).join(", ") || "",
      ...opts.components.map((c) =>
        stringifyAnswer(c, response.answers[c.slideId]?.[c.key])
      )
    ];
  }

  protected modifyQueryBuilder(
    qb: SelectQueryBuilder<CalloutResponse>,
    fieldPrefix: string
  ): void {
    qb.orderBy(`${fieldPrefix}createdAt`, "ASC");
    qb.leftJoinAndSelect(`${fieldPrefix}assignee`, "assignee");
    qb.leftJoinAndSelect(`${fieldPrefix}contact`, "contact");
    qb.leftJoinAndSelect(`${fieldPrefix}tags`, "tags");
    qb.leftJoinAndSelect("tags.tag", "tag");
  }

  protected async modifyResult(
    result: Paginated<CalloutResponse>
  ): Promise<void> {
    const comments = await getRepository(CalloutResponseComment).find({
      where: {
        responseId: In(result.items.map((response) => response.id))
      },
      relations: { contact: true },
      order: { createdAt: "ASC" }
    });

    const commentsByResponseId = groupBy(comments, (c) => c.responseId);

    for (const response of result.items) {
      const responseComments = commentsByResponseId[response.id];
      if (responseComments) {
        response.comments = responseComments;
      }
    }
  }

  async export(
    auth: AuthInfo | undefined,
    calloutSlug: string,
    query: GetExportQuery
  ): Promise<[string, string]> {
    const callout = await getRepository(Callout).findOneBy({
      slug: calloutSlug
    });
    if (!callout) {
      throw new NotFoundError();
    }

    const components = getCalloutComponents(callout.formSchema).filter(
      (c) => c.input
    );

    const result = await this.fetch(auth, {
      limit: -1,
      ...query,
      callout,
      // Store components to avoid having to flatten them in convert()
      components
    });

    const exportName = `responses-${
      callout.title
    }_${new Date().toISOString()}.csv`;

    const headers = [
      "Date",
      "Number",
      "Bucket",
      "Tags",
      "Assignee",
      "FirstName",
      "LastName",
      "FullName",
      "EmailAddress",
      "IsGuest",
      "Comments",
      ...components.map((c) => c.label || c.key)
    ];

    return [
      exportName,
      stringify([headers, ...result.items], {
        cast: { date: (d) => d.toISOString() }
      })
    ];
  }
}

function commentText(comment: CalloutResponseComment) {
  const date = format(comment.createdAt, "Pp");
  return `${comment.contact.fullname} (${date}): ${comment.text}`;
}

export default new CalloutResponseExporter();