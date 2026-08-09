import { supabase } from '../supabase/client';
import { listPlaces, upsertRemotePlace } from '../db/placesRepo';
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

  data
    .filter((row: any) => idsToPull.includes(row.id))
    .forEach((row: any) => {
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
}
