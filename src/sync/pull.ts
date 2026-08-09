import { supabase } from '../supabase/client';
import { listPlaces, upsertRemotePlace, upsertRemotePhoto } from '../db/placesRepo';
import type { Place } from '../types';

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
