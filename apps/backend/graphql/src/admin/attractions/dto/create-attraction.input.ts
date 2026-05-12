import { Field, Float, Int, InputType } from "@nestjs/graphql";

@InputType()
export class CreateAttractionInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field({ nullable: true })
  province?: string;

  @Field({ nullable: true })
  activityType?: string;

  @Field(() => Int, { nullable: true })
  durationMinutes?: number;

  @Field(() => Int, { nullable: true })
  difficulty?: number;

  @Field({ nullable: true })
  googlePlaceId?: string;
}
