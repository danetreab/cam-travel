import { Field, Float, ObjectType } from "@nestjs/graphql";
import {
  FilterableField,
  IDField,
  SortableField,
} from "../../../lib/nestjs-query-drizzle";

@ObjectType("Item")
export class ItemDto {
  @IDField()
  id!: string;

  @FilterableField()
  @SortableField()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @FilterableField(() => Float)
  @SortableField(() => Float)
  price!: number;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  createdAt!: Date;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  updatedAt!: Date;
}
