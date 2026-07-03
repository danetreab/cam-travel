import { Module } from "@nestjs/common";
import { AiTravelController } from "./ai-travel.controller";
import { AiTravelService } from "./ai-travel.service";

@Module({
  controllers: [AiTravelController],
  providers: [AiTravelService],
})
export class AiTravelModule {}
