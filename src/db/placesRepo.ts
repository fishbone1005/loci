import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import { buildListQuery, ListPlacesOptions } from './queries';
import { supabase } from '../supabase/client';
import type { Place, Photo, PlaceListItem, NewPlaceInput } from '../types';
import type { SQLiteBindValue } from 'expo-sqlite';

function nowIso(): string {
  return new Date().toISOString();
}

// Must be a real UUID: the Supabase `places`/`photos` tables have uuid primary keys,
// so anything else is rejected on upload. No fallback on purpose — a silent bad
// fallback is what hid this being broken.
function newId(): string {
  return Crypto.randomUUID();
}

export function createPlace(input: NewPlaceInput, userId: string | null): Place {
  const db = getDb();
  const id = newId();
  const createdAt = nowIso();

  db.runSync(
    `INSERT INTO places (id, user_id, name, address, latitude, longitude, memo, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, input.name, input.address, input.latitude, input.longitude, input.memo, createdAt, createdAt]
  );

  input.photoUris.forEach((uri, index) => {
    db.runSync(
      `INSERT INTO photos (id, place_id, storage_path, local_uri, sort_order, synced) VALUES (?, ?, NULL, ?, ?, 0)`,
      [newId(), id, uri, index]
    );
  });

  return {
    id,
    userId,
    name: input.name,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    memo: input.memo,
    createdAt,
    updatedAt: createdAt,
    synced: false,
  };
}

export function listPlaces(options: ListPlacesOptions): PlaceListItem[] {
  const db = getDb();
  const { sql, params } = buildListQuery(options);
  const rows = db.getAllSync<any>(sql, params as SQLiteBindValue[]);
  return rows.map((row) => {
    const thumb = db.getFirstSync<any>(
      'SELECT * FROM photos WHERE place_id = ? ORDER BY sort_order ASC LIMIT 1',
      [row.id]
    );
    return { ...rowToPlace(row), thumb: thumb ? rowToPhoto(thumb) : null };
  });
}

export function getPlaceWithPhotos(id: string): { place: Place; photos: Photo[] } | null {
  const db = getDb();
  const row = db.getFirstSync<any>('SELECT * FROM places WHERE id = ?', [id]);
  if (!row) return null;
  const photoRows = db.getAllSync<any>('SELECT * FROM photos WHERE place_id = ? ORDER BY sort_order ASC', [id]);
  return { place: rowToPlace(row), photos: photoRows.map(rowToPhoto) };
}

export function updatePlace(id: string, changes: Partial<Pick<Place, 'name' | 'address' | 'memo'>>): void {
  const db = getDb();
  const current = db.getFirstSync<any>('SELECT * FROM places WHERE id = ?', [id]);
  if (!current) return;
  db.runSync(
    `UPDATE places SET name = ?, address = ?, memo = ?, updated_at = ?, synced = 0 WHERE id = ?`,
    [changes.name ?? current.name, changes.address ?? current.address, changes.memo ?? current.memo, nowIso(), id]
  );
}

export function deletePlace(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM photos WHERE place_id = ?', [id]);
  // The schema's ON DELETE CASCADE is inert — nothing turns on `PRAGMA foreign_keys`
  // — so the join rows have to go explicitly or they orphan at synced = 0 forever.
  db.runSync('DELETE FROM place_categories WHERE place_id = ?', [id]);
  db.runSync('DELETE FROM places WHERE id = ?', [id]);
  // Best-effort remote delete so the row can't resurrect on the next pull.
  // Fire-and-forget: RLS already scopes it, and offline deletes stay local-only.
  // ponytail: no tombstone queue — an offline delete won't retry; add one if it bites.
  supabase.from('places').delete().eq('id', id).then(
    () => {},
    () => {}
  );
}

/**
 * Attach every locally-created (logged-out) row to the user who just logged in,
 * and mark them dirty so the next sync pushes them. Without this, `user_id = NULL`
 * rows can never pass the `auth.uid() = user_id` RLS policy.
 */
export function claimLocalPlaces(userId: string): void {
  const db = getDb();
  db.runSync('UPDATE places SET user_id = ?, synced = 0 WHERE user_id IS NULL', [userId]);
}

export function listUnsyncedPlaces(): Place[] {
  // Unowned rows can never pass the `auth.uid() = user_id` RLS policy, so don't
  // burn a guaranteed-failing request on them; login claims them first.
  const rows = getDb().getAllSync<any>('SELECT * FROM places WHERE synced = 0 AND user_id IS NOT NULL', []);
  return rows.map(rowToPlace);
}

export function listUnsyncedPhotosForPlace(placeId: string): Photo[] {
  const rows = getDb().getAllSync<any>('SELECT * FROM photos WHERE place_id = ? AND synced = 0', [placeId]);
  return rows.map(rowToPhoto);
}

export function markPlaceSynced(id: string): void {
  getDb().runSync('UPDATE places SET synced = 1 WHERE id = ?', [id]);
}

export function markPhotoSynced(id: string): void {
  getDb().runSync('UPDATE photos SET synced = 1 WHERE id = ?', [id]);
}

export function upsertRemotePlace(place: Place): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO places (id, user_id, name, address, latitude, longitude, memo, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [place.id, place.userId, place.name, place.address, place.latitude, place.longitude, place.memo, place.createdAt, place.updatedAt]
  );
}

/** Cache a photo row pulled from the cloud. `local_uri` stays NULL until the file is downloaded. */
export function upsertRemotePhoto(photo: Photo): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO photos (id, place_id, storage_path, local_uri, sort_order, synced)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [photo.id, photo.placeId, photo.storagePath, photo.localUri, photo.sortOrder]
  );
}

function rowToPlace(row: any): Place {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: !!row.synced,
  };
}

function rowToPhoto(row: any): Photo {
  return {
    id: row.id,
    placeId: row.place_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    synced: !!row.synced,
  };
}
