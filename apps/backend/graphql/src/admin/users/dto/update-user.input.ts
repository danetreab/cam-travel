import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  role?: string;

  @Field({ nullable: true })
  image?: string;

  @Field({ nullable: true })
  banned?: boolean;

  @Field({ nullable: true })
  banReason?: string;

  @Field(() => Date, { nullable: true })
  banExpires?: Date;
}
