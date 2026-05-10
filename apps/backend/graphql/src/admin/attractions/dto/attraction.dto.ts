import { Field, Float, Int, ObjectType } from "@nestjs/graphql";
import {
  FilterableField,
  IDField,
  SortableField,
} from "../../../lib/nestjs-query-drizzle";

@ObjectType("Attraction")
export class AttractionDto {
  @IDField()
  id!: string;

  @FilterableField()
  @SortableField()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @FilterableField(() => String, { nullable: true })
  @SortableField(() => String, { nullable: true })
  activityType?: string | null;

  @FilterableField(() => Int, { nullable: true })
  @SortableField(() => Int, { nullable: true })
  durationMinutes?: number | null;

  @FilterableField(() => Int, { nullable: true })
  @SortableField(() => Int, { nullable: true })
  difficulty?: number | null;

  @Field(() => String, { nullable: true })
  googlePlaceId?: string | null;

  @SortableField(() => Float, { nullable: true })
  cachedRating?: number | null;

  @SortableField(() => Int, { nullable: true })
  cachedUserRatingsTotal?: number | null;

  @Field(() => Date, { nullable: true })
  placesRefreshedAt?: Date | null;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  createdAt!: Date;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  updatedAt!: Date;
}
