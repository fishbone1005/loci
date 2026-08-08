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
  localUri: string;
  sortOrder: number;
  synced: boolean;
};

export type NewPlaceInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  memo: string;
  photoUris: string[];
};
