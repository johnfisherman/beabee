import { UUIDParam } from "@api/data";
import { GetMembersData, GetMembersQuery } from "@api/data/MemberData";
import { fetchPaginatedMembers } from "@api/utils/members";
import SegmentService from "@core/services/SegmentService";
import { buildRuleQuery } from "@core/utils/rules";
import Member from "@models/Member";
import Segment from "@models/Segment";
import {
  Authorized,
  Get,
  JsonController,
  Params,
  QueryParams
} from "routing-controllers";
import { createQueryBuilder, getRepository } from "typeorm";

interface GetSegmentData extends Segment {}

@JsonController("/segments")
@Authorized("admin")
export class SegmentController {
  @Get("/")
  async getSegments(): Promise<GetSegmentData[]> {
    return await SegmentService.getSegmentsWithCount();
  }

  @Get("/:id")
  async getSegment(
    @Params() { id }: UUIDParam
  ): Promise<GetSegmentData | undefined> {
    const segment = await getRepository(Segment).findOne(id);
    if (segment) {
      segment.memberCount = await SegmentService.getSegmentMemberCount(segment);
      return segment;
    }
  }

  @Get("/:id/members")
  async getSegmentMembers(
    @Params() { id }: UUIDParam,
    @QueryParams() query: GetMembersQuery
  ): Promise<GetMembersData | undefined> {
    const segment = await getRepository(Segment).findOne(id);
    if (segment) {
      const qb = createQueryBuilder(Member, "m");
      buildRuleQuery(qb, segment.ruleGroup);
      return await fetchPaginatedMembers(qb, query);
    }
  }
}
