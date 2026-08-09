export type Place = {
  id: string;
  userId: string | null;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  memo: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  synced: boolean;
};

export type Photo = {
  id: string;
  placeId: string;
  storagePath: string | null;
  localUri: string | null;
  sortOrder: number;
  synced: boolean;
};

/** A place plus its first photo, for the list screen's card thumbnail. */
export type PlaceListItem = Place & { thumb: Photo | null };

export type NewPlaceInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  memo: string;
  photoUris: string[];
};

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  createdAt: string; // ISO 8601
  synced: boolean;
};

export type PlaceCategory = {
  placeId: string;
  categoryId: string;
  synced: boolean;
};

/** A category plus its place count and a representative thumbnail, for the album grid. */
export type CategorySummary = {
  id: string;
  name: string;
  placeCount: number;
  thumb: string | null;
};
