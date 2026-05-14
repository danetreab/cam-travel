import { Module } from "@nestjs/common";
import { SavedAttractionsService } from "./saved-attractions.service";
import { SavedAttractionsResolver } from "./saved-attractions.resolver";

@Module({
  providers: [SavedAttractionsService, SavedAttractionsResolver],
})
export class SavedAttractionsModule {}
