import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { PlacesService } from "./places.service";

// Server-side proxy for Google Places photos. The browser hits this route;
// we resolve the photo `name` to a googleusercontent.com URL using the Places
// media endpoint with skipHttpRedirect=true (so the API key stays on the
// server) and then 302 the browser to the resolved URL.
@Controller("api/v1/attractions/:attractionId/photos")
export class AttractionsPhotosController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  async proxy(
    @Param("attractionId") _attractionId: string,
    @Query("name") name: string | undefined,
    @Query("maxHeight") maxHeight: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!name) throw new NotFoundException("photo name required");
    const maxHeightPx = maxHeight ? Math.min(parseInt(maxHeight, 10) || 800, 4800) : 800;
    const url = await this.places.resolvePhotoUri(name, maxHeightPx);
    if (!url) throw new NotFoundException("photo unavailable");
    res.redirect(302, url);
  }
}
