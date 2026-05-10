import { Args, ID, Query, Resolver } from "@nestjs/graphql";
import { Post } from "./post.model";

const POSTS: Post[] = [
  { id: "1", title: "Hello world", body: "First post body.", authorId: "1" },
  { id: "2", title: "Refine + better-auth", body: "Wiring an admin panel.", authorId: "1" },
  { id: "3", title: "GraphQL dummy", body: "Code-first NestJS resolver.", authorId: "2" },
];

@Resolver(() => Post)
export class PostsResolver {
  @Query(() => [Post])
  posts(): Post[] {
    return POSTS;
  }

  @Query(() => Post, { nullable: true })
  post(@Args("id", { type: () => ID }) id: string): Post | undefined {
    return POSTS.find((p) => p.id === id);
  }
}
