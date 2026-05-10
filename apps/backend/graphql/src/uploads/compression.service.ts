import { Injectable } from "@nestjs/common";
import sharp from "sharp";

@Injectable()
export class CompressionService {
  private readonly compressibleMimetypes = new Set([
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/tiff",
    "image/bmp",
    "image/png",
  ]);

  canCompress(mimetype: string): boolean {
    return this.compressibleMimetypes.has(mimetype);
  }

  async compressImage(
    buffer: Buffer,
    options: { maxWidth?: number; quality?: number } = {},
  ): Promise<Buffer> {
    const { maxWidth = 1200, quality = 80 } = options;
    return sharp(buffer)
      .resize(maxWidth, null, { withoutEnlargement: true, fit: "inside" })
      .jpeg({ quality })
      .toBuffer();
  }

  async generateThumbnail(
    buffer: Buffer,
    options: { size?: number } = {},
  ): Promise<Buffer> {
    const { size = 200 } = options;
    return sharp(buffer)
      .resize(size, size, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
  }
}
