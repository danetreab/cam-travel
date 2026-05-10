import { Field, Int, ObjectType } from "@nestjs/graphql";

// A single Google Places photo. `url` is a server-side proxy URL — the actual
// Places photo media call (which carries the API key) happens server-to-server
// when the proxy route is hit. Clients never see the API key.
@ObjectType("AttractionPhoto")
export class AttractionPhotoDto {
  @Field()
  name!: string;

  @Field()
  url!: string;

  @Field(() => Int, { nullable: true })
  widthPx?: number;

  @Field(() => Int, { nullable: true })
  heightPx?: number;
}
