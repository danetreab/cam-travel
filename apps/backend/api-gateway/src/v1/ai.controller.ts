import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import type { Request } from "express";
import { firstValueFrom, timeout } from "rxjs";
import { AuthGuard } from "../auth/auth.guard";
import { GRAPHQL_CLIENT } from "../graphql/graphql.tokens";

const AI_TIMEOUT_MS = 45000;

type AuthedRequest = Request & {
  user?: { id: string; email: string; role: string | null } | null;
  session?: unknown;
};

type AiTravelRequest = {
  message: string;
  planId?: string;
  userLocation?: { lat: number; lng: number } | null;
  language?: string;
};

type AiTravelPlacePatch = {
  saved?: boolean;
  removed?: boolean;
};

type AiRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { statusCode: number; message: string } };

@Controller("api/v1/ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(@Inject(GRAPHQL_CLIENT) private readonly client: ClientProxy) {}

  @Post("travel")
  travel(@Body() body: AiTravelRequest, @Req() req: AuthedRequest) {
    return this.send("ai.travel", body, req);
  }

  @Get("plans/:id")
  getPlan(@Param("id") planId: string, @Req() req: AuthedRequest) {
    return this.send("ai.plan.get", { planId }, req);
  }

  @Patch("plans/:planId/places/:googlePlaceId")
  patchPlace(
    @Param("planId") planId: string,
    @Param("googlePlaceId") googlePlaceId: string,
    @Body() patch: AiTravelPlacePatch,
    @Req() req: AuthedRequest,
  ) {
    return this.send(
      "ai.plan.place.patch",
      { planId, googlePlaceId, patch },
      req,
    );
  }

  private async send(pattern: string, body: unknown, req: AuthedRequest) {
    const result = await firstValueFrom(
      this.client
        .send(pattern, {
          body,
          user: req.user ?? null,
          session: req.session ?? null,
        })
        .pipe(timeout(AI_TIMEOUT_MS)),
    ) as AiRpcResult<unknown>;

    if (!result.ok) {
      throw new HttpException(result.error.message, result.error.statusCode);
    }
    return result.data;
  }
}
