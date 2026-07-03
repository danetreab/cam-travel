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
  Res,
  UseGuards,
} from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import type { Request, Response } from "express";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  type UIMessage,
} from "ai";
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
  sessionId?: string;
  userLocation?: { lat: number; lng: number } | null;
  language?: string;
};

type AiTravelPlacePatch = {
  saved?: boolean;
  removed?: boolean;
};

type PlannerDataParts = {
  status: { step: string; label: string };
  plan: unknown;
};

type PlannerMessage = UIMessage<unknown, PlannerDataParts>;

type AiTravelStreamRequest = {
  messages?: PlannerMessage[];
  planId?: string;
  sessionId?: string;
  userLocation?: { lat: number; lng: number } | null;
  language?: string;
};

type AiTravelStreamEvent =
  | {
      type: "status";
      step: string;
      label: string;
    }
  | {
      type: "result";
      data: unknown;
    }
  | {
      type: "error";
      statusCode: number;
      message: string;
    };

type AiRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { statusCode: number; message: string } };

@Controller("api/v1/ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(@Inject(GRAPHQL_CLIENT) private readonly client: ClientProxy) {}

  @Post("travel/stream")
  travelStream(
    @Body() body: AiTravelStreamRequest,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const originalMessages = Array.isArray(body.messages) ? body.messages : [];
    const message = this.lastUserText(originalMessages);
    const request: AiTravelRequest = {
      message,
      planId: body.planId,
      sessionId: body.sessionId,
      userLocation: body.userLocation ?? null,
      language: body.language,
    };

    const stream = createUIMessageStream<PlannerMessage>({
      originalMessages,
      execute: async ({ writer }) => {
        const textId = "planner-response";
        const events = this.client.send<AiTravelStreamEvent>(
          "ai.travel.stream",
          {
            body: request,
            user: req.user ?? null,
            session: req.session ?? null,
          },
        );

        await new Promise<void>((resolve, reject) => {
          let subscription: { unsubscribe: () => void } | undefined;
          const cleanup = () => {
            res.off("close", onClose);
          };
          const onClose = () => {
            subscription?.unsubscribe();
            cleanup();
            resolve();
          };
          subscription = events.subscribe({
            next: (event) => {
              if (event.type === "status") {
                writer.write({
                  type: "data-status",
                  id: "planner-status",
                  data: { step: event.step, label: event.label },
                });
                return;
              }

              if (event.type === "result") {
                writer.write({ type: "text-start", id: textId });
                writer.write({
                  type: "text-delta",
                  id: textId,
                  delta: "Here is a plan you can keep refining in this chat.",
                });
                writer.write({ type: "text-end", id: textId });
                writer.write({
                  type: "data-plan",
                  id: "planner-plan",
                  data: event.data,
                });
                return;
              }

              reject(new HttpException(event.message, event.statusCode));
            },
            error: (error) => {
              cleanup();
              reject(error);
            },
            complete: () => {
              cleanup();
              resolve();
            },
          });

          res.on("close", onClose);
        });
      },
      onError: (error) =>
        error instanceof Error ? error.message : "Planner stream failed",
    });

    pipeUIMessageStreamToResponse({
      response: res,
      stream,
    });
  }

  @Post("travel")
  travel(@Body() body: AiTravelRequest, @Req() req: AuthedRequest) {
    return this.send("ai.travel", body, req);
  }

  @Get("plans/:id")
  getPlan(@Param("id") planId: string, @Req() req: AuthedRequest) {
    return this.send("ai.plan.get", { planId }, req);
  }

  @Get("sessions")
  listSessions(@Req() req: AuthedRequest) {
    return this.send("ai.sessions.list", {}, req);
  }

  @Get("sessions/:id")
  getSession(@Param("id") sessionId: string, @Req() req: AuthedRequest) {
    return this.send("ai.session.get", { sessionId }, req);
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

  private lastUserText(messages: PlannerMessage[]): string {
    let userMessage: PlannerMessage | undefined;
    for (const message of messages) {
      if (message.role === "user") {
        userMessage = message;
      }
    }
    return (
      userMessage?.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim() ?? ""
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
