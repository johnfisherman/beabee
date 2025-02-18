import { ServerResponse } from "node:http";

import { validate } from "class-validator";
import { Request } from "express";
import {
  Action,
  Interceptor,
  InterceptorInterface,
  InternalServerError
} from "routing-controllers";

import { log as mainLogger } from "@core/logging";

const log = mainLogger.child({ app: "validate-response-interceptor" });

@Interceptor()
export class ValidateResponseInterceptor implements InterceptorInterface {
  async intercept(action: Action, content: any) {
    if (
      content === undefined ||
      content === null ||
      content instanceof ServerResponse
    ) {
      return content;
    }

    const request = action.request as Request;
    const groups = request.user?.hasRole("admin") ? ["admin"] : [];
    const items = Array.isArray(content) ? content : [content];

    for (const item of items) {
      const errors = await validate(item, {
        groups,
        always: true,
        strictGroups: true,
        whitelist: true,
        forbidUnknownValues: true,
        forbidNonWhitelisted: true,
        validationError: { target: false }
      });
      if (errors.length > 0) {
        log.error("Validation failed on response", { errors });
        throw new InternalServerError("Validation failed");
      }
    }

    return content;
  }
}
