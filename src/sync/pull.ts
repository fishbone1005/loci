import { supabase } from '../supabase/client';
import { listPlaces, upsertRemotePlace, upsertRemotePhoto } from '../db/placesRepo';
import { listCategories, upsertRemoteCategory, upsertRemotePlaceCategory } from '../db/categoriesRepo';
import type { Place, Category } from '../types';

export function placesToPull(remoteIds: string[], localIds: string[]): string[] {
  const localSet = new Set(localIds);
  return remoteIds.filter((id) => !localSet.has(id));
}

export async function pullRemotePlaces(userId: string): Promise<void> {
  const { data, error } = await supabase.from('places').select('*').eq('user_id', userId);
  if (error || !data) return;

  const localIds = listPlaces({ sort: 'recent' }).map((p) => p.id);
  const remoteIds = data.map((row: any) => row.id);
  const idsToPull = placesToPull(remoteIds, localIds);

  const rowsToPull = data.filter((row: any) => idsToPull.includes(row.id));
  if (rowsToPull.length === 0) return;

  rowsToPull.forEach((row: any) => {
    const place: Place = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      memo: row.memo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      synced: true,
    };
    upsertRemotePlace(place);
  });

  // Photo metadata too, otherwise a restore yields photo-less places.
  // The files themselves are not downloaded; the screens resolve a signed URL
  // from `storage_path` while `local_uri` is null.
  const { data: photoRows } = await supabase
    .from('photos')
    .select('*')
    .in(
      'place_id',
      rowsToPull.map((row: any) => row.id)
    );

  (photoRows ?? []).forEach((row: any) => {
    upsertRemotePhoto({
      id: row.id,
      placeId: row.place_id,
      storagePath: row.storage_path,
      localUri: null,
      sortOrder: row.sort_order ?? 0,
      synced: true,
    });
  });
}

export async function pullRemoteCategories(userId: string): Promise<void> {
  const { data, error } = await supabase.from('categories').select('*').eq('user_id', userId);
  if (error || !data) return;

  const localIds = listCategories().map((c) => c.id);
  const remoteIds = data.map((row: any) => row.id);
  const idsToPull = placesToPull(remoteIds, localIds);

  data
    .filter((row: any) => idsToPull.includes(row.id))
    .forEach((row: any) => {
      const category: Category = {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: row.created_at,
        synced: true,
      };
      upsertRemoteCategory(category);
    });
}

/**
 * RLS already scopes `place_categories` to rows whose place belongs to the
 * caller, so this needs no explicit user filter (unlike the two functions
 * above, which filter on a `user_id` column that place_categories doesn't have).
 */
export async function pullRemotePlaceCategories(): Promise<void> {
  const { data, error } = await supabase.from('place_categories').select('place_id, category_id');
  if (error || !data) return;

  data.forEach((row: any) => {
    upsertRemotePlaceCategory({ placeId: row.place_id, categoryId: row.category_id, synced: true });
  });
}

export async function pullRemoteData(userId: string): Promise<void> {
  await pullRemotePlaces(userId);
  await pullRemoteCategories(userId);
  await pullRemotePlaceCategories();
}
