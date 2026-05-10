import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth/auth";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthModule.forRoot({ auth })],
  controllers: [HealthController],
})
export class AppModule {}
