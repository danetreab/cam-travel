import { Args, Query, Resolver } from "@nestjs/graphql";
import { CrudResolver } from "../../lib/nestjs-query-drizzle";
import { CreateAttractionInput } from "./dto/create-attraction.input";
import { UpdateAttractionInput } from "./dto/update-attraction.input";
import { AttractionDto } from "./dto/attraction.dto";
import { AttractionsTopPerProvinceInput } from "./dto/top-per-province.input";
import { AttractionsService } from "./attractions.service";

@Resolver(() => AttractionDto)
export class AttractionsResolver extends CrudResolver({
  DTOClass: AttractionDto,
  CreateDTOClass: CreateAttractionInput,
  UpdateDTOClass: UpdateAttractionInput,
  enableSubscriptions: true,
}) {
  constructor(private readonly attractions: AttractionsService) {
    super(attractions);
  }

  @Query(() => [AttractionDto], { name: "attractionsTopPerProvince" })
  async attractionsTopPerProvince(
    @Args("input", { type: () => AttractionsTopPerProvinceInput })
    input: AttractionsTopPerProvinceInput,
  ): Promise<AttractionDto[]> {
    return this.attractions.topPerProvince(input);
  }
}
