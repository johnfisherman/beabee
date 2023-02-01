import { Paginated } from "@beabee/beabee-common";
import {
  CurrentUser,
  Get,
  JsonController,
  QueryParams
} from "routing-controllers";

import {
  fetchPaginatedCalloutResponses,
  GetCalloutResponseData,
  GetCalloutResponsesQuery
} from "@api/data/CalloutResponseData";

import Contact from "@models/Contact";

@JsonController("/callout-responses")
export class CalloutResponseController {
  @Get("/")
  getCalloutResponses(
    @CurrentUser() contact: Contact,
    @QueryParams() query: GetCalloutResponsesQuery
  ): Promise<Paginated<GetCalloutResponseData>> {
    return fetchPaginatedCalloutResponses(query, contact);
  }
}