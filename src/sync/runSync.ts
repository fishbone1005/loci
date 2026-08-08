import NetInfo from '@react-native-community/netinfo';
import { processSyncQueue } from './syncQueue';
import { supabase } from '../supabase/client';
import {
  listUnsyncedPlaces,
  listUnsyncedPhotosForPlace,
  markPlaceSynced,
  markPhotoSynced,
} from '../db/placesRepo';
import type { Place, Photo } from '../types';

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

export async function runSync() {
  return processSyncQueue({
    listUnsyncedPlaces,
    listUnsyncedPhotos: listUnsyncedPhotosForPlace,
    isOnline,
    uploadPlace,
    uploadPhoto,
    markPlaceSynced,
    markPhotoSynced,
  });
}
