import { Controller, Get } from "@nestjs/common";

@Controller("api/v1/health")
export class HealthController {
  @Get()
  health() {
    return { ok: true, service: "api-gateway" };
  }
}
