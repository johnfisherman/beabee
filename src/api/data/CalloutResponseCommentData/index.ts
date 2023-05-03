import {
  Filters,
  Paginated,
  calloutResponseCommentFilters
} from "@beabee/beabee-common";
import CalloutResponseComment from "@models/CalloutResponseComment";
import { convertContactToData, loadContactRoles } from "../ContactData";
import { fetchPaginated } from "../PaginatedData";
import {
  GetCalloutResponseCommentData,
  GetCalloutResponseCommentsQuery
} from "./interface";

export function convertCommentToData(
  comment: CalloutResponseComment
): GetCalloutResponseCommentData {
  const commentData = {
    id: comment.id,
    contact: convertContactToData(comment.contact),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    responseId: comment.responseId,
    text: comment.text
  };

  return commentData;
}

export async function fetchPaginatedCalloutResponseComments(
  query: GetCalloutResponseCommentsQuery
): Promise<Paginated<GetCalloutResponseCommentData>> {
  const results = await fetchPaginated(
    CalloutResponseComment,
    calloutResponseCommentFilters,
    query,
    undefined,
    undefined,
    (qb, fieldPrefix) =>
      qb.leftJoinAndSelect(`${fieldPrefix}contact`, "contact")
  );

  // Load contact roles after to ensure offset/limit work
  await loadContactRoles(results.items.map((i) => i.contact));

  return {
    ...results,
    items: results.items.map((comment) => convertCommentToData(comment))
  };
}
