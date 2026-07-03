import { Controller, HttpException } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { Observable } from "rxjs";
import { AiTravelService } from "./ai-travel.service";
import type {
  AiTravelPlacePatch,
  AiTravelRequest,
  AiTravelResponse,
  AiTravelRpcPayload,
  AiTravelSessionDetail,
  AiTravelSessionSummary,
  AiTravelStreamEvent,
} from "./ai-travel.types";

type GetPlanBody = { planId: string };
type PatchPlaceBody = {
  planId: string;
  googlePlaceId: string;
  patch: AiTravelPlacePatch;
};

type AiRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { statusCode: number; message: string } };

@Controller()
export class AiTravelController {
  constructor(private readonly aiTravel: AiTravelService) {}

  @MessagePattern("ai.travel")
  travel(
    @Payload() payload: AiTravelRpcPayload<AiTravelRequest>,
  ): Promise<AiRpcResult<AiTravelResponse>> {
    return this.run(() =>
      this.aiTravel.travel(
        this.aiTravel.requireUserId(payload.user),
        payload.body,
      ),
    );
  }

  @MessagePattern("ai.travel.stream")
  travelStream(
    @Payload() payload: AiTravelRpcPayload<AiTravelRequest>,
  ): Observable<AiTravelStreamEvent> {
    return new Observable<AiTravelStreamEvent>((subscriber) => {
      void (async () => {
        try {
          const data = await this.aiTravel.travelWithProgress(
            this.aiTravel.requireUserId(payload.user),
            payload.body,
            (status) => {
              if (!subscriber.closed) {
                subscriber.next({ type: "status", ...status });
              }
            },
          );

          if (!subscriber.closed) {
            subscriber.next({ type: "result", data });
            subscriber.complete();
          }
        } catch (error) {
          if (!subscriber.closed) {
            const normalized = this.normalizeError(error);
            subscriber.next({ type: "error", ...normalized });
            subscriber.complete();
          }
        }
      })();
    });
  }

  @MessagePattern("ai.plan.get")
  getPlan(
    @Payload() payload: AiTravelRpcPayload<GetPlanBody>,
  ): Promise<AiRpcResult<AiTravelResponse>> {
    return this.run(() =>
      this.aiTravel.getPlan(
        this.aiTravel.requireUserId(payload.user),
        payload.body.planId,
      ),
    );
  }

  @MessagePattern("ai.sessions.list")
  listSessions(
    @Payload() payload: AiTravelRpcPayload,
  ): Promise<AiRpcResult<AiTravelSessionSummary[]>> {
    return this.run(() =>
      this.aiTravel.listSessions(this.aiTravel.requireUserId(payload.user)),
    );
  }

  @MessagePattern("ai.session.get")
  getSession(
    @Payload() payload: AiTravelRpcPayload<{ sessionId: string }>,
  ): Promise<AiRpcResult<AiTravelSessionDetail>> {
    return this.run(() =>
      this.aiTravel.getSession(
        this.aiTravel.requireUserId(payload.user),
        payload.body.sessionId,
      ),
    );
  }

  @MessagePattern("ai.plan.place.patch")
  patchPlace(
    @Payload() payload: AiTravelRpcPayload<PatchPlaceBody>,
  ): Promise<AiRpcResult<AiTravelResponse>> {
    return this.run(() =>
      this.aiTravel.patchPlace(
        this.aiTravel.requireUserId(payload.user),
        payload.body.planId,
        payload.body.googlePlaceId,
        payload.body.patch,
      ),
    );
  }

  private async run<T>(fn: () => Promise<T>): Promise<AiRpcResult<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (error) {
      const normalized = this.normalizeError(error);
      return {
        ok: false,
        error: normalized,
      };
    }
  }

  private normalizeError(error: unknown): {
    statusCode: number;
    message: string;
  } {
    if (error instanceof HttpException) {
      return {
        statusCode: error.getStatus(),
        message: this.httpMessage(error),
      };
    }
    return {
      statusCode: 500,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private httpMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message?: string | string[] }).message;
      return Array.isArray(message) ? message.join("; ") : (message ?? error.message);
    }
    return error.message;
  }
}
