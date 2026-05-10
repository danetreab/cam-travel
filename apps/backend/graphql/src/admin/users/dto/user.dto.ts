import { Field, ObjectType } from "@nestjs/graphql";
import {
  FilterableField,
  IDField,
  SortableField,
} from "../../../lib/nestjs-query-drizzle";

@ObjectType("User")
export class UserDto {
  @IDField()
  id!: string;

  @FilterableField()
  @SortableField()
  email!: string;

  @FilterableField()
  @SortableField()
  name!: string;

  @FilterableField()
  emailVerified!: boolean;

  @Field(() => String, { nullable: true })
  image?: string | null;

  @FilterableField()
  @SortableField()
  role!: string;

  @FilterableField()
  banned!: boolean;

  @Field(() => String, { nullable: true })
  banReason?: string | null;

  @Field(() => Date, { nullable: true })
  banExpires?: Date | null;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  createdAt!: Date;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  updatedAt!: Date;
}
