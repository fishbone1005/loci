# Loci Cloud Storage Subscription — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the parts of the 500MB-free / 월 1,900원-unlimited cloud storage subscription that can be built before the App Store / Play Store listings are approved: storage-size tracking per photo, a free-tier upload limit, and account-screen usage UI with a stub subscribe screen. Real in-app purchases (RevenueCat SDK, store products) are explicitly out of scope until the store registrations clear — this plan stops at a "곧 지원 예정" placeholder on the subscribe screen.

**Architecture:** Every photo gets its file size recorded at persist time and carried through local SQLite → Supabase, mirroring the existing sync pattern. A Postgres RPC (`get_storage_usage`, already applied directly to the live project) sums a user's uploaded photo bytes server-side under RLS. `runSync()` fetches subscription status + current usage once per call and wraps the existing photo uploader in a closure that tracks a running byte counter, skipping (not erroring) any photo that would push a free user over 500MB — it simply stays unsynced and retries on the next `runSync()`.

**Tech Stack:** Same as v1/v1.1 (Expo/RN/TypeScript, expo-sqlite, Supabase, Jest). No new npm dependencies.

## Global Constraints

- All user-facing text is Korean.
- Visual tokens from `src/theme/tokens.ts` — reuse existing tokens.
- Native-module/network code is NOT unit tested; pure logic gets Jest tests, matching established policy.
- Local storage stays unlimited/free always — the limit applies only to what gets uploaded to Supabase.
- The Supabase schema for this plan (`photos.size_bytes` column, `subscriptions` table + RLS, `get_storage_usage()` function) has already been applied directly to the live project — no task touches Supabase's SQL editor.
- Existing local SQLite installs already have real user data (this app is in active use), so the new `photos.size_bytes` column must be added via an idempotent `ALTER TABLE`, not just appended to the `CREATE TABLE IF NOT EXISTS` (which is a no-op on a table that already exists).
- The actual RevenueCat purchase flow and the real "upgrade" webhook are out of scope for this plan — `subscriptions.is_premium` will read as `false` for everyone until that later work lands, which is fine: the free-tier behavior this plan builds is what's live in the meantime.

---

### Task 1: Local schema migration and photo size tracking through the data layer

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/client.ts`
- Modify: `src/types.ts`
- Modify: `src/db/placesRepo.ts`
- Modify: `src/storage/photoFiles.ts`
- Modify: `src/sync/pull.ts`

**Interfaces:**
- Produces: `Photo.sizeBytes: number | null` (`src/types.ts`); `PersistedPhoto` type and `persistPhotos(uris): Promise<PersistedPhoto[]>` (`src/storage/photoFiles.ts`, changed return shape) — consumed by Task 2's capture screen. `NewPlaceInput.photos: PersistedPhoto[]` (replaces `photoUris: string[]`) — consumed by Task 2.

- [ ] **Step 1: Add the idempotent migration mechanism**

```ts
// src/db/schema.ts — add MIGRATIONS export, keep SCHEMA_SQL exactly as-is
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  storage_path TEXT,
  local_uri TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_photos_place_id ON photos(place_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS place_categories (
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  synced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (place_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_place_categories_category_id ON place_categories(category_id);
`;

/**
 * Idempotent ALTERs applied after SCHEMA_SQL, for columns/tables added after
 * an install already exists (CREATE TABLE IF NOT EXISTS is a no-op on an
 * existing table, so new columns need an explicit migration). Each entry
 * must be safe to run twice — getDb() ignores the "duplicate column"/
 * "already exists" error a repeat run throws.
 */
export const MIGRATIONS: string[] = ['ALTER TABLE photos ADD COLUMN size_bytes INTEGER'];
```

- [ ] **Step 2: Run migrations in the DB client**

```ts
// src/db/client.ts — replace the whole file
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, MIGRATIONS } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('loci.db');
    db.execSync(SCHEMA_SQL);
    for (const migration of MIGRATIONS) {
      try {
        db.execSync(migration);
      } catch {
        // Already applied on a prior run (e.g. "duplicate column name") — safe to ignore.
      }
    }
  }
  return db;
}
```

- [ ] **Step 3: Add `sizeBytes` to the `Photo` type and change `NewPlaceInput`**

```ts
// src/types.ts — modify the existing Photo and NewPlaceInput types, leave everything else in the file unchanged
export type Photo = {
  id: string;
  placeId: string;
  storagePath: string | null;
  localUri: string | null;
  sortOrder: number;
  sizeBytes: number | null;
  synced: boolean;
};

export type NewPlaceInput = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  memo: string;
  photos: { uri: string; sizeBytes: number }[];
};
```

- [ ] **Step 4: Update `persistPhotos` to return sizes alongside URIs**

```ts
// src/storage/photoFiles.ts — replace persistPhotos, leave usePhotoUri exactly as it is
import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { supabase } from '../supabase/client';
import type { Photo } from '../types';

const PHOTO_DIR = 'photos';

export type PersistedPhoto = { uri: string; sizeBytes: number };

/**
 * Copy picker-provided photos out of the OS cache into the app's document
 * directory. `expo-image-picker` hands back URIs into a temp/cache folder that
 * the system is free to purge, which would leave records pointing at nothing.
 *
 * Returns the permanent `file://` URIs plus each file's size in bytes (needed
 * for the cloud storage quota). A photo that fails to copy is dropped rather
 * than stored as a dangling cache URI.
 */
export async function persistPhotos(uris: string[]): Promise<PersistedPhoto[]> {
  if (uris.length === 0) return [];

  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const saved: PersistedPhoto[] = [];
  for (const uri of uris) {
    try {
      const destination = new File(dir, `${Crypto.randomUUID()}.jpg`);
      await new File(uri).copy(destination);
      saved.push({ uri: destination.uri, sizeBytes: destination.size ?? 0 });
    } catch {
      // Skip this photo; the rest of the record is still worth saving.
    }
  }
  return saved;
}

/**
 * Resolve the URI to render for a photo: the local file when we have one,
 * otherwise a short-lived signed Storage URL (cloud-restored photos have
 * `storagePath` but no local file yet).
 */
export function usePhotoUri(photo: Pick<Photo, 'localUri' | 'storagePath'> | null | undefined): string | null {
  const [uri, setUri] = useState<string | null>(photo?.localUri ?? null);

  useEffect(() => {
    if (!photo) {
      setUri(null);
      return;
    }
    if (photo.localUri) {
      setUri(photo.localUri);
      return;
    }
    if (!photo.storagePath) {
      setUri(null);
      return;
    }

    let cancelled = false;
    supabase.storage
      .from('place-photos')
      .createSignedUrl(photo.storagePath, 3600)
      .then(({ data }) => {
        if (!cancelled) setUri(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });

    return () => {
      cancelled = true;
    };
  }, [photo?.localUri, photo?.storagePath]);

  return uri;
}
```

Verify `File`'s `.size` property exists on the installed `expo-file-system` version's type definitions before relying on it (check `node_modules/expo-file-system`'s types) — if the property is named differently, use the correct one and note the discrepancy in your report.

- [ ] **Step 5: Wire `size_bytes` through `placesRepo.ts`**

```ts
// src/db/placesRepo.ts — modify createPlace, upsertRemotePhoto, and rowToPhoto; leave every other function in the file exactly as it is
export function createPlace(input: NewPlaceInput, userId: string | null): Place {
  const db = getDb();
  const id = newId();
  const createdAt = nowIso();

  db.runSync(
    `INSERT INTO places (id, user_id, name, address, latitude, longitude, memo, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, input.name, input.address, input.latitude, input.longitude, input.memo, createdAt, createdAt]
  );

  input.photos.forEach((photo, index) => {
    db.runSync(
      `INSERT INTO photos (id, place_id, storage_path, local_uri, sort_order, size_bytes, synced) VALUES (?, ?, NULL, ?, ?, ?, 0)`,
      [newId(), id, photo.uri, index, photo.sizeBytes]
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
```

```ts
/** Cache a photo row pulled from the cloud. `local_uri` stays NULL until the file is downloaded. */
export function upsertRemotePhoto(photo: Photo): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO photos (id, place_id, storage_path, local_uri, sort_order, size_bytes, synced)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [photo.id, photo.placeId, photo.storagePath, photo.localUri, photo.sortOrder, photo.sizeBytes]
  );
}
```

```ts
function rowToPhoto(row: any): Photo {
  return {
    id: row.id,
    placeId: row.place_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    sizeBytes: row.size_bytes,
    synced: !!row.synced,
  };
}
```

- [ ] **Step 6: Pull `size_bytes` down with cloud-restored photos**

In `src/sync/pull.ts`'s `pullRemotePlaces`, the block that upserts photo rows currently reads:

```ts
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
```

Add `sizeBytes: row.size_bytes ?? null` to that object:

```ts
  (photoRows ?? []).forEach((row: any) => {
    upsertRemotePhoto({
      id: row.id,
      placeId: row.place_id,
      storagePath: row.storage_path,
      localUri: null,
      sortOrder: row.sort_order ?? 0,
      sizeBytes: row.size_bytes ?? null,
      synced: true,
    });
  });
```

Nothing else in `pull.ts` changes.

- [ ] **Step 7: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: errors in `app/(tabs)/index.tsx` (still uses the old `photoUris: string[]` shape) — that's expected, Task 2 fixes it. Confirm the errors are confined to that one file; anything else failing means something in this task's own files is wrong.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/client.ts src/types.ts src/db/placesRepo.ts src/storage/photoFiles.ts src/sync/pull.ts
git commit -m "feat: track photo file size through local schema and cloud sync"
```

---

### Task 2: Wire photo sizes through the capture screen and sync upload

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `src/sync/runSync.ts`

**Interfaces:**
- Consumes: `PersistedPhoto`, `persistPhotos` (Task 1's `src/storage/photoFiles.ts`); `NewPlaceInput.photos` (Task 1's `src/types.ts`); `createPlace` (Task 1's `src/db/placesRepo.ts`).

- [ ] **Step 1: Update the capture screen's photo state to carry sizes**

In `app/(tabs)/index.tsx`, add the import:

```ts
import { persistPhotos, type PersistedPhoto } from '../../src/storage/photoFiles';
```

(replacing the existing `import { persistPhotos } from '../../src/storage/photoFiles';` line).

Change the state declaration:

```ts
const [photos, setPhotos] = useState<PersistedPhoto[]>([]);
```

(replacing `const [photoUris, setPhotoUris] = useState<string[]>([]);`).

Update `takePhoto` and `pickFromLibrary` to assign into `photos` instead of `photoUris` (only the `setPhotoUris(...)` call site changes in each, the rest of both functions is untouched):

```ts
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('카메라 접근 권한이 필요해요', '설정에서 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setPhotos(await persistPhotos(result.assets.map((asset) => asset.uri)));
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('사진 접근 권한이 필요해요', '설정에서 권한을 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos(await persistPhotos(result.assets.map((asset) => asset.uri)));
    }
  }
```

Update `save()`'s `createPlace` call and reset line:

```ts
    const place = createPlace(
      {
        name: name.trim(),
        address,
        memo,
        photos,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      },
      null
    );
    assignCategories(place.id, selectedCategoryIds);
    runSync().catch(() => {});
    setPhotos([]);
```

(only `photoUris` → `photos` changes on the `createPlace` call and the reset line; everything else in `save()` is untouched).

Update the JSX preview, which currently reads `photoUris.length > 0` / `uri: photoUris[0] }`:

```tsx
      <Pressable style={styles.photoFrame} onPress={choosePhotoSource}>
        {photos.length > 0 ? (
          <Image source={{ uri: photos[0].uri }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoPlaceholder}>사진 선택 / 촬영</Text>
        )}
      </Pressable>
```

- [ ] **Step 2: Track upload usage in `runSync()` and skip photos that would exceed the free limit**

This step depends on Task 3's `src/subscription/limits.ts` (`wouldExceedLimit`) and `src/subscription/status.ts` (`getSubscriptionStatus`, `getStorageUsageBytes`) — if Task 3 isn't done yet, do Task 3 first, then come back to this step. Replace `src/sync/runSync.ts`'s whole file:

```ts
import NetInfo from '@react-native-community/netinfo';
import { processSyncQueue, processFlatSyncQueue } from './syncQueue';
import { supabase } from '../supabase/client';
import { getSubscriptionStatus, getStorageUsageBytes } from '../subscription/status';
import { wouldExceedLimit } from '../subscription/limits';
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
  const response = await fetch(photo.localUri!);
  const blob = await response.blob();
  const path = `${photo.placeId}/${photo.id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('place-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('photos').upsert({
    id: photo.id,
    place_id: photo.placeId,
    storage_path: path,
    sort_order: photo.sortOrder,
    size_bytes: photo.sizeBytes,
  });
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

  // Fetched once per runSync() call, not per photo — cheap and matches the
  // spec's "one lookup per sync run" requirement. `usageBytes` is a running
  // counter updated as each photo actually uploads in this same run, so a
  // batch of several photos can't collectively blow past the limit even
  // though each individual check only sees the tally so far.
  const { isPremium } = await getSubscriptionStatus();
  let usageBytes = isPremium ? 0 : await getStorageUsageBytes();

  async function uploadPhotoWithLimit(photo: Photo): Promise<void> {
    // Cloud-restored photos have no local file to push back up.
    if (!photo.localUri) {
      markPhotoSynced(photo.id);
      return;
    }
    if (!isPremium && wouldExceedLimit(usageBytes, photo.sizeBytes ?? 0, isPremium)) {
      // Leave unsynced — retried on the next runSync() (e.g. after upgrading
      // or after other photos free up headroom, though headroom only grows
      // via upgrading since deletes don't currently reduce usage retroactively).
      return;
    }
    await uploadPhoto(photo);
    usageBytes += photo.sizeBytes ?? 0;
  }

  const placesResult = await processSyncQueue({
    listUnsyncedPlaces,
    listUnsyncedPhotos: listUnsyncedPhotosForPlace,
    isOnline,
    uploadPlace,
    uploadPhoto: uploadPhotoWithLimit,
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
```

Note `uploadPhoto` itself dropped its old `if (!photo.localUri)` guard (using `photo.localUri!` instead) — that check now lives in `uploadPhotoWithLimit`, which is the only caller. Don't leave the old guard duplicated in both places.

- [ ] **Step 3: Verify types compile and the bundler is happy**

```bash
npx tsc --noEmit
npx expo export --platform ios
```

Delete the generated `dist/` output afterward. `tsc` should now be fully clean (no errors anywhere).

- [ ] **Step 4: Manual verification (Expo Go, real device)**

1. Take or pick a photo on the capture screen, save → confirm the preview showed correctly and the save didn't error.
2. Log in and confirm the place still syncs normally (small photos, nowhere near 500MB, so nothing should be skipped).

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx src/sync/runSync.ts
git commit -m "feat: wire photo sizes through capture and gate cloud uploads at the free limit"
```

---

### Task 3: Free-tier limit logic and subscription/usage lookups

**Files:**
- Create: `src/subscription/limits.ts`
- Create: `src/subscription/limits.test.ts`
- Create: `src/subscription/status.ts`

**Interfaces:**
- Produces: `FREE_STORAGE_LIMIT_BYTES` constant, `wouldExceedLimit(currentUsageBytes, newPhotoBytes, isPremium): boolean` (pure, tested) — consumed by Task 2's `runSync.ts`. `getSubscriptionStatus(): Promise<{isPremium: boolean}>`, `getStorageUsageBytes(): Promise<number>` (real Supabase calls, not tested) — consumed by Task 2's `runSync.ts` and Task 4's account screen.

- [ ] **Step 1: Write the failing tests for the limit check**

```ts
// src/subscription/limits.test.ts
import { wouldExceedLimit, FREE_STORAGE_LIMIT_BYTES } from './limits';

describe('wouldExceedLimit', () => {
  test('a premium user never exceeds, regardless of usage', () => {
    expect(wouldExceedLimit(999_999_999_999, 1, true)).toBe(false);
  });

  test('a free user well under the limit does not exceed', () => {
    expect(wouldExceedLimit(100 * 1024 * 1024, 50 * 1024 * 1024, false)).toBe(false);
  });

  test('a free user landing exactly on the limit does not exceed', () => {
    expect(wouldExceedLimit(0, FREE_STORAGE_LIMIT_BYTES, false)).toBe(false);
  });

  test('a free user over the limit exceeds', () => {
    expect(wouldExceedLimit(FREE_STORAGE_LIMIT_BYTES, 1, false)).toBe(true);
  });

  test('a free user already over the limit exceeds even for a zero-byte photo', () => {
    expect(wouldExceedLimit(FREE_STORAGE_LIMIT_BYTES + 1, 0, false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/subscription/limits.test.ts
```

Expected: FAIL — module `./limits` not found.

- [ ] **Step 3: Write the limit check**

```ts
// src/subscription/limits.ts
export const FREE_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB

export function wouldExceedLimit(currentUsageBytes: number, newPhotoBytes: number, isPremium: boolean): boolean {
  if (isPremium) return false;
  return currentUsageBytes + newPhotoBytes > FREE_STORAGE_LIMIT_BYTES;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/subscription/limits.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Write the subscription/usage lookups (not unit tested — real Supabase calls)**

```ts
// src/subscription/status.ts
import { supabase } from '../supabase/client';

export async function getSubscriptionStatus(): Promise<{ isPremium: boolean }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { isPremium: false };

  const { data: row } = await supabase.from('subscriptions').select('is_premium').eq('user_id', userId).maybeSingle();
  return { isPremium: row?.is_premium ?? false };
}

export async function getStorageUsageBytes(): Promise<number> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return 0;

  const { data, error } = await supabase.rpc('get_storage_usage');
  if (error || data == null) return 0;
  return Number(data);
}
```

- [ ] **Step 6: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/subscription/limits.ts src/subscription/limits.test.ts src/subscription/status.ts
git commit -m "feat: add free-tier storage limit check and subscription/usage lookups"
```

---

### Task 4: Account screen usage display and stub subscribe screen

**Files:**
- Modify: `app/login.tsx`
- Create: `app/subscribe.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `getSubscriptionStatus`, `getStorageUsageBytes` (Task 3's `src/subscription/status.ts`); `FREE_STORAGE_LIMIT_BYTES` (Task 3's `src/subscription/limits.ts`); `colors`, `fonts`, `spacing` (`src/theme/tokens.ts`).

- [ ] **Step 1: Show storage usage on the account screen**

In `app/login.tsx`, add the import:

```ts
import { getSubscriptionStatus, getStorageUsageBytes } from '../src/subscription/status';
import { FREE_STORAGE_LIMIT_BYTES } from '../src/subscription/limits';
```

Add a usage state and a loader, and call the loader both on mount (when already logged in) and right after a successful login:

```ts
  const [usage, setUsage] = useState<{ isPremium: boolean; usedBytes: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession({ email: data.session.user.email ?? '' });
        loadUsage();
      }
    });
  }, []);

  async function loadUsage() {
    const [{ isPremium }, usedBytes] = await Promise.all([getSubscriptionStatus(), getStorageUsageBytes()]);
    setUsage({ isPremium, usedBytes });
  }
```

(This replaces the existing `useEffect` block, which only called `setSession`.)

In `submit()`, call `loadUsage()` alongside the existing `setSession(...)` call on successful login:

```ts
      if (userId) {
        // Adopt everything recorded while logged out before pulling/pushing —
        // `user_id = NULL` rows can never pass the RLS policy otherwise.
        claimLocalPlaces(userId);
        claimLocalCategories(userId);
        await pullRemoteData(userId);
        runSync().catch(() => {});
        setSession({ email: data.session!.user.email ?? '' });
        loadUsage();
      }
```

(Only the added `loadUsage();` line changes here — everything else in `submit()` stays as it is.)

Render the usage block in the `session` branch, below the subtitle and above the logout button:

```tsx
  if (session) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Loci</Text>
        <Text style={styles.subtitle}>{session.email}로 로그인됨</Text>
        {usage && (
          usage.isPremium ? (
            <Text style={styles.usageText}>무제한 클라우드 저장 중</Text>
          ) : (
            <View style={styles.usageBlock}>
              <Text style={styles.usageText}>
                {Math.round(usage.usedBytes / (1024 * 1024))}MB / {Math.round(FREE_STORAGE_LIMIT_BYTES / (1024 * 1024))}MB 사용 중
              </Text>
              <View style={styles.usageTrack}>
                <View
                  style={[
                    styles.usageFill,
                    { width: `${Math.min(100, (usage.usedBytes / FREE_STORAGE_LIMIT_BYTES) * 100)}%` },
                  ]}
                />
              </View>
              <Pressable onPress={() => router.push('/subscribe')}>
                <Text style={styles.upgradeLink}>무제한으로 업그레이드</Text>
              </Pressable>
            </View>
          )
        )}
        <Pressable style={styles.button} onPress={logout}>
          <Text style={styles.buttonText}>로그아웃</Text>
        </Pressable>
      </View>
    );
  }
```

Add the new styles to the existing `StyleSheet.create` call, alongside the current ones:

```ts
  usageBlock: { gap: 8, marginBottom: 8 },
  usageText: { fontSize: 12, color: colors.sageOlive, textAlign: 'center' },
  usageTrack: { height: 6, borderRadius: 3, backgroundColor: colors.mist, overflow: 'hidden' },
  usageFill: { height: '100%', backgroundColor: colors.gold },
  upgradeLink: { fontSize: 12, color: colors.stampRed, textAlign: 'center' },
```

- [ ] **Step 2: Write the stub subscribe screen**

```tsx
// app/subscribe.tsx
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, spacing } from '../src/theme/tokens';

export default function SubscribeScreen() {
  function notifyComingSoon() {
    Alert.alert('곧 지원 예정', '스토어 등록 절차가 끝나면 구독하실 수 있어요.');
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>무제한 클라우드</Text>
      <Text style={styles.price}>월 1,900원</Text>
      <Text style={styles.desc}>저장 용량 제한 없이 모든 사진을 클라우드에 백업해요.</Text>
      <Pressable style={styles.button} onPress={notifyComingSoon}>
        <Text style={styles.buttonText}>구독하기</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.close}>닫기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, justifyContent: 'center', gap: 12 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, textAlign: 'center' },
  price: { fontFamily: fonts.mono, fontSize: 18, color: colors.gold, textAlign: 'center' },
  desc: { fontSize: 13, color: colors.sageOlive, textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: colors.stampRed, borderRadius: 5, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.paper, fontWeight: '600' },
  close: { textAlign: 'center', color: colors.muted, marginTop: spacing.md, fontSize: 12 },
});
```

- [ ] **Step 3: Register the route**

In `app/_layout.tsx`, add a fourth `Stack.Screen` after the existing `login` entry:

```tsx
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="place/[id]" options={{ title: '' }} />
      <Stack.Screen name="login" options={{ title: '계정', presentation: 'modal' }} />
      <Stack.Screen name="subscribe" options={{ title: '구독', presentation: 'modal' }} />
```

(Only the new `subscribe` line is added — the other three entries and the `ThemeProvider`/font-loading logic around them stay exactly as they are.)

- [ ] **Step 4: Verify types compile and the bundler is happy**

```bash
npx tsc --noEmit
npx expo export --platform ios
```

Delete the generated `dist/` output afterward.

- [ ] **Step 5: Manual verification (Expo Go, real device)**

1. Log in on the account screen → confirm "0MB / 500MB 사용 중" (or actual usage) appears with a progress bar.
2. Tap "무제한으로 업그레이드" → confirm the subscribe screen opens, showing the price and description.
3. Tap 구독하기 → confirm the "곧 지원 예정" alert appears (this is the expected stub behavior, not a bug).
4. Tap 닫기 → confirm it returns to the account screen.

- [ ] **Step 6: Commit**

```bash
git add app/login.tsx app/subscribe.tsx app/_layout.tsx
git commit -m "feat: show cloud storage usage on the account screen with a stub subscribe screen"
```

---

## Post-plan check

```bash
npx tsc --noEmit
npx jest
```

Expected: no type errors, all tests passing (should grow from v1.1's 35 to 40: +5 for `wouldExceedLimit`). Then one final manual pass on a real device: take a photo, save, confirm it still syncs; open the account screen and confirm usage shows and the subscribe screen stub works as described above.

## What's explicitly not in this plan

- The RevenueCat SDK integration and real purchase flow.
- The Supabase Edge Function that receives RevenueCat webhooks and writes `subscriptions.is_premium`.
- Creating the actual subscription product in App Store Connect / Google Play Console.

All three depend on the store registrations being approved first, per the design spec. Once they are, a follow-up plan wires the subscribe screen's stub button to a real purchase flow.
