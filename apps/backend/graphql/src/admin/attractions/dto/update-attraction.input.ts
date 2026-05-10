import { Field, Float, Int, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateAttractionInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field({ nullable: true })
  activityType?: string;

  @Field(() => Int, { nullable: true })
  durationMinutes?: number;

  @Field(() => Int, { nullable: true })
  difficulty?: number;

  @Field({ nullable: true })
  googlePlaceId?: string;
}
