import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AiTravelController } from "./ai-travel.controller";
import { AiTravelService } from "./ai-travel.service";

@Module({
  imports: [HttpModule],
  controllers: [AiTravelController],
  providers: [AiTravelService],
})
export class AiTravelModule {}
