import {
  Filters,
  Paginated,
  PaginatedQuery,
  RoleType
} from "@beabee/beabee-common";
import { ObjectLiteral, SelectQueryBuilder } from "typeorm";

import { FieldHandlers, fetchPaginated } from "@api/data/PaginatedData";

import UnauthorizedError from "@api/errors/UnauthorizedError";
import NotFoundError from "@api/errors/NotFoundError";

import Contact from "@models/Contact";

export abstract class BaseTransformer<
  Model extends ObjectLiteral,
  GetDto,
  FilterName extends string,
  GetDtoOpts = unknown,
  Query extends GetDtoOpts & PaginatedQuery = GetDtoOpts & PaginatedQuery
> {
  abstract model: { new (): Model };
  modelIdField = "id";
  abstract filters: Filters<FilterName>;

  allowedRoles: RoleType[] | undefined;

  // TODO: could rework this once fetchPaginated has been refactored
  protected getFieldHandlers(
    runner: Contact | undefined
  ): FieldHandlers<FilterName> {
    return {};
  }

  abstract convert(model: Model, opts: GetDtoOpts, caller?: Contact): GetDto;

  protected transformQuery(query: Query, caller: Contact | undefined): Query {
    return query;
  }

  protected modifyQueryBuilder(
    qb: SelectQueryBuilder<Model>,
    fieldPrefix: string,
    opts: GetDtoOpts,
    caller: Contact | undefined
  ): void {}

  protected async modifyResult(
    result: Paginated<Model>,
    query: Query,
    caller: Contact | undefined
  ): Promise<void> {}

  async fetch(
    caller: Contact | undefined,
    query: Query
  ): Promise<Paginated<GetDto>> {
    if (
      this.allowedRoles &&
      !this.allowedRoles.some((r) => caller?.hasRole(r))
    ) {
      throw new UnauthorizedError();
    }

    const result = await fetchPaginated(
      this.model,
      this.filters,
      this.transformQuery(query, caller),
      caller,
      this.getFieldHandlers(caller),
      (qb, fieldPrefix) =>
        this.modifyQueryBuilder(qb, fieldPrefix, query, caller)
    );

    await this.modifyResult(result, query, caller);

    return {
      ...result,
      items: result.items.map((item) => this.convert(item, query, caller))
    };
  }

  async fetchOne(
    caller: Contact | undefined,
    query: Query
  ): Promise<GetDto | undefined> {
    const result = await this.fetch(caller, { ...query, limit: 1 });
    return result.items[0];
  }

  async fetchOneById(
    caller: Contact | undefined,
    id: string,
    opts?: GetDtoOpts
  ): Promise<GetDto | undefined> {
    const query = {
      ...opts,
      rules: {
        condition: "AND",
        rules: [{ field: this.modelIdField, operator: "equal", value: [id] }]
      }
    } as Query;

    return await this.fetchOne(caller, query);
  }

  async fetchOneByIdOrFail(
    caller: Contact | undefined,
    id: string,
    opts?: GetDtoOpts
  ): Promise<GetDto> {
    const result = await this.fetchOneById(caller, id, opts);
    if (!result) {
      throw new NotFoundError();
    }
    return result;
  }
}
