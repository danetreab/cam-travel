import { Field, Float, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateItemInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;
}
