import type { Place, Photo } from '../types';

export type SyncDeps = {
  listUnsyncedPlaces: () => Place[];
  listUnsyncedPhotos: (placeId: string) => Photo[];
  isOnline: () => Promise<boolean>;
  uploadPlace: (place: Place) => Promise<void>;
  uploadPhoto: (photo: Photo) => Promise<void>;
  markPlaceSynced: (id: string) => void;
  markPhotoSynced: (id: string) => void;
};

export type SyncResult = { attempted: number; succeeded: number; failed: number; skippedOffline: boolean };

export async function processSyncQueue(deps: SyncDeps): Promise<SyncResult> {
  const online = await deps.isOnline();
  if (!online) {
    return { attempted: 0, succeeded: 0, failed: 0, skippedOffline: true };
  }

  const pending = deps.listUnsyncedPlaces();
  let succeeded = 0;
  let failed = 0;

  for (const place of pending) {
    try {
      await deps.uploadPlace(place);
      const photos = deps.listUnsyncedPhotos(place.id);
      for (const photo of photos) {
        await deps.uploadPhoto(photo);
        deps.markPhotoSynced(photo.id);
      }
      deps.markPlaceSynced(place.id);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { attempted: pending.length, succeeded, failed, skippedOffline: false };
}

export type FlatSyncDeps<T> = {
  listUnsynced: () => T[];
  isOnline: () => Promise<boolean>;
  upload: (item: T) => Promise<void>;
  markSynced: (item: T) => void;
};

/**
 * Same shape as processSyncQueue but for resources with no nested sub-items
 * (categories, place_categories) — one upload-and-mark step per row.
 */
export async function processFlatSyncQueue<T>(deps: FlatSyncDeps<T>): Promise<SyncResult> {
  const online = await deps.isOnline();
  if (!online) {
    return { attempted: 0, succeeded: 0, failed: 0, skippedOffline: true };
  }

  const pending = deps.listUnsynced();
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await deps.upload(item);
      deps.markSynced(item);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { attempted: pending.length, succeeded, failed, skippedOffline: false };
}
