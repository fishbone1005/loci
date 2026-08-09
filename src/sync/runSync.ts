import NetInfo from '@react-native-community/netinfo';
import { processSyncQueue, processFlatSyncQueue } from './syncQueue';
import { supabase } from '../supabase/client';
import {
  claimLocalPlaces,
  listUnsyncedPlaces,
  listUnsyncedPhotosForPlace,
  markPlaceSynced,
  markPhotoSynced,
} from '../db/placesRepo';
import {
  claimLocalCategories,
  listUnsyncedCategories,
  markCategorySynced,
  listUnsyncedPlaceCategories,
  markPlaceCategorySynced,
} from '../db/categoriesRepo';
import type { Place, Photo, Category, PlaceCategory } from '../types';

async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected && state.isInternetReachable !== false;
}

async function uploadPlace(place: Place): Promise<void> {
  const { error } = await supabase.from('places').upsert({
    id: place.id,
    user_id: place.userId,
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    memo: place.memo,
    created_at: place.createdAt,
    updated_at: place.updatedAt,
  });
  if (error) throw error;
}

async function uploadPhoto(photo: Photo): Promise<void> {
  // Cloud-restored photos have no local file to push back up.
  if (!photo.localUri) {
    markPhotoSynced(photo.id);
    return;
  }
  const response = await fetch(photo.localUri);
  const blob = await response.blob();
  const path = `${photo.placeId}/${photo.id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('place-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from('photos')
    .upsert({ id: photo.id, place_id: photo.placeId, storage_path: path, sort_order: photo.sortOrder });
  if (dbError) throw dbError;
}

async function uploadCategory(category: Category): Promise<void> {
  const { error } = await supabase.from('categories').upsert({
    id: category.id,
    user_id: category.userId,
    name: category.name,
    created_at: category.createdAt,
  });
  if (error) throw error;
}

async function uploadPlaceCategory(pc: PlaceCategory): Promise<void> {
  const { error } = await supabase
    .from('place_categories')
    .upsert({ place_id: pc.placeId, category_id: pc.categoryId });
  if (error) throw error;
}

export async function runSync() {
  // Authoritative claiming point. Saves always write `user_id = NULL` and
  // `listUnsyncedPlaces`/`listUnsyncedCategories` skip unowned rows, so
  // anything recorded while a persisted session was already active would
  // otherwise never be uploaded. Idempotent — only touches unowned rows.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) {
    claimLocalPlaces(userId);
    claimLocalCategories(userId);
  }

  // Categories before places+photos, and place_categories after both —
  // the join table's rows reference ids that must already exist remotely.
  await processFlatSyncQueue({
    listUnsynced: listUnsyncedCategories,
    isOnline,
    upload: uploadCategory,
    markSynced: (category: Category) => markCategorySynced(category.id),
  });

  const placesResult = await processSyncQueue({
    listUnsyncedPlaces,
    listUnsyncedPhotos: listUnsyncedPhotosForPlace,
    isOnline,
    uploadPlace,
    uploadPhoto,
    markPlaceSynced,
    markPhotoSynced,
  });

  await processFlatSyncQueue({
    listUnsynced: listUnsyncedPlaceCategories,
    isOnline,
    upload: uploadPlaceCategory,
    markSynced: (pc: PlaceCategory) => markPlaceCategorySynced(pc.placeId, pc.categoryId),
  });

  return placesResult;
}
