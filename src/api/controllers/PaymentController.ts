import {
  Authorized,
  CurrentUser,
  Get,
  JsonController,
  Param,
  QueryParams
} from "routing-controllers";

import { PaginatedDto } from "@api/dto/PaginatedDto";
import {
  GetPaymentDto,
  GetPaymentOptsDto,
  ListPaymentsDto
} from "@api/dto/PaymentDto";
import PaymentTransformer from "@api/transformers/PaymentTransformer";

import Contact from "@models/Contact";

@JsonController("/payment")
@Authorized()
export class PaymentController {
  @Get("/")
  async getPayments(
    @CurrentUser() caller: Contact,
    @QueryParams() query: ListPaymentsDto
  ): Promise<PaginatedDto<GetPaymentDto>> {
    return await PaymentTransformer.fetch(caller, query);
  }

  @Get("/:id")
  async getPayment(
    @CurrentUser() caller: Contact,
    @Param("id") id: string,
    @QueryParams() query: GetPaymentOptsDto
  ): Promise<GetPaymentDto | undefined> {
    return await PaymentTransformer.fetchOneById(caller, id, query);
  }
}
