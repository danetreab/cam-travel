import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class CreateUserInput {
  @Field()
  email!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  role?: string;

  @Field({ nullable: true })
  image?: string;
}
