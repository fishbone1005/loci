import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import { supabase } from '../supabase/client';
import type { Category, PlaceCategory, CategorySummary } from '../types';

function nowIso(): string {
  return new Date().toISOString();
}

export function findOrCreateCategory(name: string, userId: string | null): Category {
  const trimmed = name.trim();
  const db = getDb();
  const existing = db.getFirstSync<any>('SELECT * FROM categories WHERE name = ? COLLATE NOCASE', [trimmed]);
  if (existing) return rowToCategory(existing);

  const id = Crypto.randomUUID();
  const createdAt = nowIso();
  db.runSync('INSERT INTO categories (id, user_id, name, created_at, synced) VALUES (?, ?, ?, ?, 0)', [
    id,
    userId,
    trimmed,
    createdAt,
  ]);
  return { id, userId, name: trimmed, createdAt, synced: false };
}

export function listCategories(): Category[] {
  const rows = getDb().getAllSync<any>('SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC', []);
  return rows.map(rowToCategory);
}

export function listCategoriesWithCounts(): CategorySummary[] {
  const db = getDb();
  const categories = db.getAllSync<any>('SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC', []);
  return (
    categories
      .map((row: any) => {
        // Joined to `places` so join rows left over from a pre-fix delete can't
        // inflate the count with places that no longer exist.
        const countRow = db.getFirstSync<any>(
          `SELECT COUNT(*) as count FROM place_categories
           JOIN places ON places.id = place_categories.place_id
           WHERE place_categories.category_id = ?`,
          [row.id]
        );
        const thumbRow = db.getFirstSync<any>(
          `SELECT photos.local_uri as local_uri, photos.storage_path as storage_path FROM place_categories
           JOIN places ON places.id = place_categories.place_id
           LEFT JOIN photos ON photos.place_id = places.id AND photos.sort_order = 0
           WHERE place_categories.category_id = ?
           ORDER BY places.created_at DESC
           LIMIT 1`,
          [row.id]
        );
        return {
          id: row.id,
          name: row.name,
          placeCount: countRow?.count ?? 0,
          // Carries storagePath too so `usePhotoUri` can fall back to a signed URL
          // for cloud-restored photos, which have no local file.
          thumb: thumbRow ? { localUri: thumbRow.local_uri, storagePath: thumbRow.storage_path } : null,
        };
      })
      // Empty categories (typos, abandoned captures) go invisible instead of
      // needing a delete UI — the spec deliberately has no category management screen.
      .filter((summary) => summary.placeCount > 0)
  );
}

export function listCategoriesForPlace(placeId: string): Category[] {
  const rows = getDb().getAllSync<any>(
    `SELECT categories.* FROM categories
     JOIN place_categories ON place_categories.category_id = categories.id
     WHERE place_categories.place_id = ?
     ORDER BY categories.name COLLATE NOCASE ASC`,
    [placeId]
  );
  return rows.map(rowToCategory);
}

/** Replaces a place's full set of category assignments with exactly `categoryIds`. */
export function assignCategories(placeId: string, categoryIds: string[]): void {
  const db = getDb();
  // Untagging is a local delete, and the push path only ever upserts — without this
  // the removed row survives remotely and the next pull resurrects it at synced = 1.
  // Scoped to the categories being dropped, not all of the place's rows, so it stays
  // correct even if it lands after runSync() has already pushed the new set.
  // Fire-and-forget, same as deletePlace: this stays a synchronous, offline-safe write.
  // ponytail: no tombstone queue — an offline untag won't retry; add one if it bites.
  const remoteDelete = supabase.from('place_categories').delete().eq('place_id', placeId);
  (categoryIds.length > 0
    ? remoteDelete.not('category_id', 'in', `(${categoryIds.join(',')})`)
    : remoteDelete
  ).then(
    () => {},
    () => {}
  );
  db.runSync('DELETE FROM place_categories WHERE place_id = ?', [placeId]);
  categoryIds.forEach((categoryId) => {
    db.runSync('INSERT INTO place_categories (place_id, category_id, synced) VALUES (?, ?, 0)', [
      placeId,
      categoryId,
    ]);
  });
}

/** Mirrors `claimLocalPlaces` in placesRepo.ts — see that function's doc comment. */
export function claimLocalCategories(userId: string): void {
  getDb().runSync('UPDATE categories SET user_id = ?, synced = 0 WHERE user_id IS NULL', [userId]);
}

export function listUnsyncedCategories(): Category[] {
  const rows = getDb().getAllSync<any>('SELECT * FROM categories WHERE synced = 0 AND user_id IS NOT NULL', []);
  return rows.map(rowToCategory);
}

export function markCategorySynced(id: string): void {
  getDb().runSync('UPDATE categories SET synced = 1 WHERE id = ?', [id]);
}

export function listUnsyncedPlaceCategories(): PlaceCategory[] {
  // Same owner guard as listUnsyncedPlaces/listUnsyncedCategories: a row whose place
  // is unowned (logged out) or gone can never pass RLS, so don't retry it every sync.
  const rows = getDb().getAllSync<any>(
    'SELECT * FROM place_categories WHERE synced = 0 AND place_id IN (SELECT id FROM places WHERE user_id IS NOT NULL)',
    []
  );
  return rows.map(rowToPlaceCategory);
}

export function markPlaceCategorySynced(placeId: string, categoryId: string): void {
  getDb().runSync('UPDATE place_categories SET synced = 1 WHERE place_id = ? AND category_id = ?', [
    placeId,
    categoryId,
  ]);
}

export function upsertRemoteCategory(category: Category): void {
  getDb().runSync('INSERT OR REPLACE INTO categories (id, user_id, name, created_at, synced) VALUES (?, ?, ?, ?, 1)', [
    category.id,
    category.userId,
    category.name,
    category.createdAt,
  ]);
}

export function upsertRemotePlaceCategory(pc: PlaceCategory): void {
  getDb().runSync('INSERT OR REPLACE INTO place_categories (place_id, category_id, synced) VALUES (?, ?, 1)', [
    pc.placeId,
    pc.categoryId,
  ]);
}

function rowToCategory(row: any): Category {
  return { id: row.id, userId: row.user_id, name: row.name, createdAt: row.created_at, synced: !!row.synced };
}

function rowToPlaceCategory(row: any): PlaceCategory {
  return { placeId: row.place_id, categoryId: row.category_id, synced: !!row.synced };
}
