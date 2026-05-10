import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

@ObjectType("ItemFile")
export class ItemFileDto {
  @Field(() => ID)
  id!: string;

  @Field()
  filename!: string;

  @Field()
  originalFilename!: string;

  @Field()
  mimetype!: string;

  @Field(() => Int)
  size!: number;

  @Field()
  url!: string;

  @Field({ nullable: true })
  thumbnailUrl?: string;

  @Field()
  hasThumbnail!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}
