import { Field, Float, InputType, Int } from "@nestjs/graphql";

@InputType()
export class AttractionBoundsInput {
  @Field(() => Float)
  south!: number;

  @Field(() => Float)
  west!: number;

  @Field(() => Float)
  north!: number;

  @Field(() => Float)
  east!: number;
}

@InputType()
export class AttractionsTopPerProvinceInput {
  @Field(() => Int, { defaultValue: 20 })
  perProvince!: number;

  @Field(() => AttractionBoundsInput, { nullable: true })
  bounds?: AttractionBoundsInput | null;

  @Field(() => String, { nullable: true })
  activityType?: string | null;
}
