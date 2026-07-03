import { UnauthorizedException } from "@nestjs/common";
import { Args, Context, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { AttractionDto } from "../attractions/dto/attraction.dto";
import { SavedAttractionsService } from "./saved-attractions.service";

// GraphQL context value forwarded from the microservice controller. The
// gateway has already validated the session, so resolvers trust these fields.
type GqlContext = {
  user?: { id: string; email: string; role: string | null } | null;
};

function requireUserId(ctx: GqlContext): string {
  // Browser GraphQL traffic must enter through the API gateway. The gateway
  // validates better-auth sessions and forwards the trusted user here.
  const id = ctx.user?.id?.trim();
  if (!id) throw new UnauthorizedException("Sign in required");
  return id;
}

@Resolver(() => AttractionDto)
export class SavedAttractionsResolver {
  constructor(private readonly saved: SavedAttractionsService) {}

  @Query(() => [AttractionDto], { name: "mySavedAttractions" })
  async mySavedAttractions(
    @Context() ctx: GqlContext,
  ): Promise<AttractionDto[]> {
    return this.saved.listForUser(requireUserId(ctx));
  }

  @Query(() => [ID], { name: "mySavedAttractionIds" })
  async mySavedAttractionIds(@Context() ctx: GqlContext): Promise<string[]> {
    return this.saved.idsForUser(requireUserId(ctx));
  }

  @Mutation(() => AttractionDto, { name: "saveAttraction" })
  async saveAttraction(
    @Args("attractionId", { type: () => ID }) attractionId: string,
    @Context() ctx: GqlContext,
  ): Promise<AttractionDto> {
    return this.saved.save(requireUserId(ctx), attractionId);
  }

  @Mutation(() => ID, { name: "unsaveAttraction" })
  async unsaveAttraction(
    @Args("attractionId", { type: () => ID }) attractionId: string,
    @Context() ctx: GqlContext,
  ): Promise<string> {
    return this.saved.unsave(requireUserId(ctx), attractionId);
  }
}
