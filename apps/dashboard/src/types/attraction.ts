import type { UploadFile } from "antd";

export type AttractionFile = {
  id: string;
  filename: string;
  originalFilename: string;
  mimetype: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  hasThumbnail: boolean;
  createdAt: string;
};

export type AttractionListFile = Pick<
  AttractionFile,
  "id" | "thumbnailUrl" | "hasThumbnail" | "mimetype"
>;

export type AttractionPhoto = {
  url: string;
};

export type Attraction = {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  province: string | null;
  activityType: string | null;
  durationMinutes: number | null;
  difficulty: number | null;
  cachedRating: number | null;
  cachedUserRatingsTotal: number | null;
  createdAt: string;
  updatedAt: string;
  files: AttractionListFile[];
  photos: AttractionPhoto[];
};

export type CreateAttractionValues = {
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  googlePlaceId?: string | null;
  province?: string;
  activityType?: string;
  durationMinutes?: number;
  difficulty?: number;
};

export type EditAttractionValues = {
  name?: string;
  description?: string | null;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string | null;
  province?: string;
  activityType?: string;
  durationMinutes?: number;
  difficulty?: number;
  files?: AttractionFile[] | UploadFile[];
};
