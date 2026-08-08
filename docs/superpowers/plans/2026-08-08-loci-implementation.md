# Loci Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 Loci mobile app — photograph a place, auto-attach its GPS address, add a name/memo, and browse the collection later by date or keyword, with local-first storage and optional Supabase cloud backup.

**Architecture:** Expo (React Native + TypeScript) app using Expo Router for the four screens (capture, list, detail, login). All reads/writes go to a local SQLite cache first (works offline); a background sync module pushes unsynced rows to Supabase (Postgres + Storage) when online and pulls down cloud-only rows on login. Visual design follows the "여백 기록부 (Margin Ledger)" tokens from the design spec.

**Tech Stack:** Expo SDK (TypeScript, Expo Router), expo-sqlite, expo-image-picker, expo-location, @supabase/supabase-js, @react-native-async-storage/async-storage, @react-native-community/netinfo, Jest (jest-expo preset).

## Global Constraints

- All user-facing text (labels, buttons, error/empty states) is Korean.
- Visual design tokens (colors, typography, component rules) are exactly as specified in `docs/superpowers/specs/2026-08-08-loci-design.md` → "비주얼 디자인" section — reuse those hex values and font stacks verbatim, don't invent new ones.
- Code that depends on native modules (expo-sqlite, expo-location, expo-image-picker) or real network calls (Supabase) cannot run under Jest's node environment. That code is **not** unit tested — it is verified manually via Expo Go on a real device, per the design spec's testing section. Automated Jest tests are reserved for pure, dependency-free logic: query builders, address formatting, sync-queue state transitions, auth error mapping, and the pull-diff calculation.
- Storage is local-first: every write commits to SQLite immediately and succeeds even offline. Cloud upload is best-effort and never blocks or fails the user-facing action.
- Login is optional. Capture, list, and detail screens work fully without an account; logging in only turns on cloud backup/restore.

---

### Task 1: Project scaffold, dependencies, and Supabase backend setup

**Files:**
- Create: Expo project files at repo root (`app/`, `package.json`, `tsconfig.json`, etc. via `create-expo-app`)
- Create: `.env` (gitignored), `.env.example`
- Modify: `.gitignore`, `package.json` (test script + jest config)

**Interfaces:**
- Produces: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars consumed by Task 3's `src/supabase/client.ts`. Supabase tables `places`, `photos` and storage bucket `place-photos` consumed by Task 6/10's upload and pull code.

- [ ] **Step 1: Scaffold the Expo app in the existing repo**

```bash
cd C:/Users/lovej/Documents/loci
npx create-expo-app@latest . --template tabs
```

This creates a TypeScript project already wired with Expo Router and an `app/(tabs)/` group (index + explore tabs) — later tasks repurpose these files rather than starting from scratch. It's safe to run inside the existing git repo; it won't touch `docs/` or `.git`.

- [ ] **Step 2: Install runtime dependencies**

```bash
npx expo install expo-image-picker expo-location expo-sqlite @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage @react-native-community/netinfo
```

- [ ] **Step 3: Install test dependencies and wire up Jest**

```bash
npm install --save-dev jest jest-expo @types/jest
```

Edit `package.json`, add:

```json
{
  "scripts": {
    "start": "expo start",
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Step 4: Add Supabase env vars**

Create `.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Copy it to `.env` and fill in the real values from the Supabase project's Settings → API page. Add to `.gitignore`:

```
.env
```

- [ ] **Step 5: Create the Supabase backend schema**

In the Supabase project's SQL editor, run:

```sql
create table places (
  id uuid primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  address text not null default '',
  latitude double precision,
  longitude double precision,
  memo text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table photos (
  id uuid primary key,
  place_id uuid references places(id) on delete cascade not null,
  storage_path text,
  sort_order int not null default 0
);

alter table places enable row level security;
alter table photos enable row level security;

create policy "Users manage their own places" on places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage photos of their own places" on photos
  for all using (exists (select 1 from places where places.id = photos.place_id and places.user_id = auth.uid()))
  with check (exists (select 1 from places where places.id = photos.place_id and places.user_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('place-photos', 'place-photos', false);

create policy "Users manage their own photo files" on storage.objects
  for all using (bucket_id = 'place-photos' and (storage.foldername(name))[1] in (
    select id::text from places where user_id = auth.uid()
  ));
```

- [ ] **Step 6: Verify the app boots**

```bash
npx expo start
```

Scan the QR code with Expo Go on a phone. Confirm the default tabs template loads without errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo app, install dependencies, add Supabase backend schema"
```

---

### Task 2: Design tokens and shared types

**Files:**
- Create: `src/theme/tokens.ts`
- Create: `src/types.ts`

**Interfaces:**
- Produces: `colors` object (`paper`, `ink`, `stampRed`, `gold`, `sageOlive`, `mist`, `wine`), `fonts` object (`serif`, `serifItalic`, `mono`) — consumed by every screen task (7–10). `Place`, `Photo`, `NewPlaceInput` types — consumed by Tasks 4, 6, 7, 8, 9, 10.

- [ ] **Step 1: Write the design tokens**

```ts
// src/theme/tokens.ts
import { Platform } from 'react-native';

export const colors = {
  paper: '#F5EFE2',
  ink: '#221F1B',
  stampRed: '#A8443B',
  gold: '#C6A15B',
  sageOlive: '#7E8566',
  mist: '#DED5C2',
  wine: '#5C2430',
} as const;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  serifItalic: Platform.select({ ios: 'Georgia-Italic', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
```

- [ ] **Step 2: Write the shared domain types**

```ts
// src/types.ts
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
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/theme/tokens.ts src/types.ts
git commit -m "feat: add design tokens and shared domain types"
```

---

### Task 3: Supabase client and auth module

**Files:**
- Create: `src/supabase/client.ts`
- Create: `src/supabase/auth.ts`
- Test: `src/supabase/auth.test.ts`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Task 1).
- Produces: `supabase` client instance — consumed by Task 6 (`runSync.ts`) and Task 10 (`pull.ts`). `signIn(email, password)`, `signUp(email, password)`, `signOut()`, `getCurrentUserId(): Promise<string | null>`, `mapAuthError(error): string` — consumed by Task 7 (`getCurrentUserId`) and Task 10 (login screen).

- [ ] **Step 1: Write the failing test for error mapping**

```ts
// src/supabase/auth.test.ts
import { mapAuthError } from './auth';

describe('mapAuthError', () => {
  test('maps invalid credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.'
    );
  });

  test('maps duplicate signup', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe('이미 가입된 이메일입니다.');
  });

  test('maps weak password', () => {
    expect(mapAuthError({ message: 'Password should be at least 6 characters' })).toBe(
      '비밀번호는 6자 이상이어야 합니다.'
    );
  });

  test('maps network errors', () => {
    expect(mapAuthError({ message: 'Network request failed' })).toBe('네트워크 연결을 확인해주세요.');
  });

  test('falls back to a generic message for unknown errors', () => {
    expect(mapAuthError({ message: 'weird server blip' })).toBe(
      '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.'
    );
  });

  test('returns empty string for no error', () => {
    expect(mapAuthError(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/supabase/auth.test.ts
```

Expected: FAIL — `./auth` has no exported member `mapAuthError`.

- [ ] **Step 3: Write the Supabase client**

```ts
// src/supabase/client.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Write the auth module**

```ts
// src/supabase/auth.ts
import { supabase } from './client';

export function mapAuthError(error: { message: string } | null): string {
  if (!error) return '';
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('already registered')) return '이미 가입된 이메일입니다.';
  if (msg.includes('password')) return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('network')) return '네트워크 연결을 확인해주세요.';
  return '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.';
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(mapAuthError(error));
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error));
  return data;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/supabase/auth.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/supabase
git commit -m "feat: add Supabase client and auth module with error mapping"
```

---

### Task 4: Local SQLite schema and repository

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `src/db/queries.ts`
- Create: `src/db/placesRepo.ts`
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Consumes: `Place`, `Photo`, `NewPlaceInput` (Task 2).
- Produces: `createPlace(input, userId): Place`, `listPlaces(options): Place[]`, `getPlaceWithPhotos(id): {place, photos} | null`, `updatePlace(id, changes): void`, `deletePlace(id): void`, `listUnsyncedPlaces(): Place[]`, `listUnsyncedPhotosForPlace(placeId): Photo[]`, `markPlaceSynced(id): void`, `markPhotoSynced(id): void`, `upsertRemotePlace(place): void` — consumed by Tasks 6, 7, 8, 9, 10. `buildListQuery(options): {sql, params}` — tested directly here.

- [ ] **Step 1: Write the failing tests for the query builder**

```ts
// src/db/queries.test.ts
import { buildListQuery } from './queries';

describe('buildListQuery', () => {
  test('defaults to recent-first with no filters', () => {
    const { sql, params } = buildListQuery({ sort: 'recent' });
    expect(sql).toBe('SELECT * FROM places ORDER BY created_at DESC');
    expect(params).toEqual([]);
  });

  test('sorts by name when requested', () => {
    const { sql } = buildListQuery({ sort: 'name' });
    expect(sql).toContain('ORDER BY name COLLATE NOCASE ASC');
  });

  test('adds a keyword filter across name and address', () => {
    const { sql, params } = buildListQuery({ sort: 'recent', query: '카페' });
    expect(sql).toContain('WHERE (name LIKE ? OR address LIKE ?)');
    expect(params).toEqual(['%카페%', '%카페%']);
  });

  test('adds a date range filter', () => {
    const { sql, params } = buildListQuery({
      sort: 'recent',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });
    expect(sql).toContain('created_at >= ?');
    expect(sql).toContain('created_at <= ?');
    expect(params).toEqual(['2026-08-01', '2026-08-31']);
  });

  test('combines keyword and date filters with AND', () => {
    const { sql } = buildListQuery({ sort: 'recent', query: '카페', dateFrom: '2026-08-01' });
    expect(sql).toContain('WHERE (name LIKE ? OR address LIKE ?) AND created_at >= ?');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/db/queries.test.ts
```

Expected: FAIL — `./queries` has no exported member `buildListQuery`.

- [ ] **Step 3: Write the schema**

```ts
// src/db/schema.ts
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
  local_uri TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_photos_place_id ON photos(place_id);
`;
```

- [ ] **Step 4: Write the DB client**

```ts
// src/db/client.ts
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('loci.db');
    db.execSync(SCHEMA_SQL);
  }
  return db;
}
```

- [ ] **Step 5: Write the query builder**

```ts
// src/db/queries.ts
export type ListPlacesOptions = {
  sort: 'recent' | 'name';
  query?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function buildListQuery(options: ListPlacesOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.query && options.query.trim().length > 0) {
    clauses.push('(name LIKE ? OR address LIKE ?)');
    const like = `%${options.query.trim()}%`;
    params.push(like, like);
  }
  if (options.dateFrom) {
    clauses.push('created_at >= ?');
    params.push(options.dateFrom);
  }
  if (options.dateTo) {
    clauses.push('created_at <= ?');
    params.push(options.dateTo);
  }

  const orderBy = options.sort === 'name' ? 'name COLLATE NOCASE ASC' : 'created_at DESC';
  const parts = ['SELECT * FROM places'];
  if (clauses.length > 0) parts.push(`WHERE ${clauses.join(' AND ')}`);
  parts.push(`ORDER BY ${orderBy}`);

  return { sql: parts.join(' '), params };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx jest src/db/queries.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 7: Write the repository**

```ts
// src/db/placesRepo.ts
import { getDb } from './client';
import { buildListQuery, ListPlacesOptions } from './queries';
import type { Place, Photo, NewPlaceInput } from '../types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function listPlaces(options: ListPlacesOptions): Place[] {
  const db = getDb();
  const { sql, params } = buildListQuery(options);
  const rows = db.getAllSync<any>(sql, params);
  return rows.map(rowToPlace);
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
  db.runSync('DELETE FROM places WHERE id = ?', [id]);
}

export function listUnsyncedPlaces(): Place[] {
  const rows = getDb().getAllSync<any>('SELECT * FROM places WHERE synced = 0', []);
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
```

`placesRepo.ts` itself is not unit tested (it calls the native `expo-sqlite` module, which doesn't run under Jest) — it's exercised for real once Task 7 (capture) and Task 8 (list) are wired up.

- [ ] **Step 8: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/db
git commit -m "feat: add local SQLite schema and places repository"
```

---

### Task 5: Location and address formatting

**Files:**
- Create: `src/location/reverseGeocode.ts`
- Test: `src/location/reverseGeocode.test.ts`

**Interfaces:**
- Produces: `getCurrentAddress(): Promise<{latitude, longitude, address} | null>`, `formatAddress(result): string` — consumed by Task 7 (capture screen).

- [ ] **Step 1: Write the failing tests for address formatting**

```ts
// src/location/reverseGeocode.test.ts
import { formatAddress } from './reverseGeocode';

describe('formatAddress', () => {
  test('joins region/city/district/street when all present', () => {
    expect(
      formatAddress({ region: '서울특별시', city: '마포구', district: '연남동', street: '동교로 158' })
    ).toBe('서울특별시 마포구 연남동 동교로 158');
  });

  test('skips missing fields without leaving blanks', () => {
    expect(formatAddress({ region: '서울특별시', city: '마포구' })).toBe('서울특별시 마포구');
  });

  test('drops duplicate consecutive parts', () => {
    expect(formatAddress({ region: '서울특별시', city: '서울특별시', district: '마포구' })).toBe(
      '서울특별시 마포구'
    );
  });

  test('returns empty string when nothing is available', () => {
    expect(formatAddress({})).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/location/reverseGeocode.test.ts
```

Expected: FAIL — `./reverseGeocode` has no exported member `formatAddress`.

- [ ] **Step 3: Write the location module**

```ts
// src/location/reverseGeocode.ts
import * as Location from 'expo-location';

export type GeoAddress = { latitude: number; longitude: number; address: string };

export function formatAddress(result: Partial<Location.LocationGeocodedAddress>): string {
  const parts = [result.region, result.city, result.district, result.street, result.name].filter(
    (part): part is string => !!part && part.trim().length > 0
  );
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(' ').trim();
}

export async function getCurrentAddress(): Promise<GeoAddress | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [result] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    address: result ? formatAddress(result) : '',
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/location/reverseGeocode.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/location
git commit -m "feat: add GPS reverse geocoding with address formatting"
```

---

### Task 6: Sync queue (core offline/retry logic)

**Files:**
- Create: `src/sync/syncQueue.ts`
- Create: `src/sync/runSync.ts`
- Test: `src/sync/syncQueue.test.ts`

**Interfaces:**
- Consumes: `Place`, `Photo` (Task 2); `listUnsyncedPlaces`, `listUnsyncedPhotosForPlace`, `markPlaceSynced`, `markPhotoSynced` (Task 4); `supabase` (Task 3).
- Produces: `processSyncQueue(deps): Promise<SyncResult>` (pure, tested) and `runSync(): Promise<SyncResult>` (wired adapter) — consumed by Task 7 (fire-and-forget after saving a place).

- [ ] **Step 1: Write the failing tests for the sync queue**

```ts
// src/sync/syncQueue.test.ts
import { processSyncQueue, SyncDeps } from './syncQueue';
import type { Place, Photo } from '../types';

function makePlace(id: string): Place {
  return {
    id,
    userId: 'u1',
    name: `장소 ${id}`,
    address: '서울',
    latitude: 37.5,
    longitude: 127,
    memo: '',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    synced: false,
  };
}

function makePhoto(id: string, placeId: string): Photo {
  return { id, placeId, storagePath: null, localUri: `file://${id}.jpg`, sortOrder: 0, synced: false };
}

describe('processSyncQueue', () => {
  test('skips entirely when offline', async () => {
    const deps: SyncDeps = {
      listUnsyncedPlaces: jest.fn(() => [makePlace('p1')]),
      listUnsyncedPhotos: jest.fn(() => []),
      isOnline: async () => false,
      uploadPlace: jest.fn(async () => {}),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced: jest.fn(),
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0, skippedOffline: true });
    expect(deps.uploadPlace).not.toHaveBeenCalled();
  });

  test('uploads each pending place and its photos, then marks them synced', async () => {
    const place = makePlace('p1');
    const photo = makePhoto('ph1', 'p1');
    const markPlaceSynced = jest.fn();
    const markPhotoSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [photo],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {}),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced,
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skippedOffline: false });
    expect(markPhotoSynced).toHaveBeenCalledWith('ph1');
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
  });

  test('leaves a place unsynced when upload fails, without throwing', async () => {
    const place = makePlace('p1');
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {
        throw new Error('network blip');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1, skippedOffline: false });
    expect(markPlaceSynced).not.toHaveBeenCalled();
  });

  test('retries a previously failed place on the next call and can succeed', async () => {
    const place = makePlace('p1');
    let attempt = 0;
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('network blip');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const first = await processSyncQueue(deps);
    expect(first.failed).toBe(1);
    expect(markPlaceSynced).not.toHaveBeenCalled();

    const second = await processSyncQueue(deps);
    expect(second.succeeded).toBe(1);
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
  });

  test('processes multiple pending places independently', async () => {
    const places = [makePlace('p1'), makePlace('p2')];
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => places,
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async (p: Place) => {
        if (p.id === 'p2') throw new Error('fail p2');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1, skippedOffline: false });
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
    expect(markPlaceSynced).not.toHaveBeenCalledWith('p2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/sync/syncQueue.test.ts
```

Expected: FAIL — `./syncQueue` module not found.

- [ ] **Step 3: Write the sync queue**

```ts
// src/sync/syncQueue.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/sync/syncQueue.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Wire up the real adapter (not unit tested — uses SQLite, NetInfo, Supabase network calls)**

```ts
// src/sync/runSync.ts
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
```

- [ ] **Step 6: Commit**

```bash
git add src/sync/syncQueue.ts src/sync/syncQueue.test.ts src/sync/runSync.ts
git commit -m "feat: add offline-first sync queue with retry, wire to Supabase"
```

---

### Task 7: Capture screen

**Files:**
- Modify: `app/(tabs)/index.tsx` (replace template content)
- Modify: `app/(tabs)/_layout.tsx` (rename/relabel tab)

**Interfaces:**
- Consumes: `colors`, `fonts` (Task 2); `getCurrentAddress` (Task 5); `createPlace` (Task 4); `runSync` (Task 6); `getCurrentUserId` (Task 3).

- [ ] **Step 1: Replace the capture screen**

```tsx
// app/(tabs)/index.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { getCurrentAddress } from '../../src/location/reverseGeocode';
import { createPlace } from '../../src/db/placesRepo';
import { runSync } from '../../src/sync/runSync';
import { getCurrentUserId } from '../../src/supabase/auth';

export default function CaptureScreen() {
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  async function pickPhotos() {
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
      setPhotoUris(result.assets.map((asset) => asset.uri));
    }
  }

  async function detectLocation() {
    setLocating(true);
    const result = await getCurrentAddress();
    setLocating(false);
    if (!result) {
      Alert.alert('위치 접근 권한이 필요해요', '주소를 직접 입력해주세요.');
      return;
    }
    setAddress(result.address);
    setCoords({ latitude: result.latitude, longitude: result.longitude });
  }

  async function save() {
    if (!name.trim()) {
      Alert.alert('가게 이름을 입력해주세요.');
      return;
    }
    const userId = await getCurrentUserId();
    createPlace(
      {
        name: name.trim(),
        address,
        memo,
        photoUris,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      },
      userId
    );
    runSync().catch(() => {});
    setPhotoUris([]);
    setName('');
    setAddress('');
    setMemo('');
    setCoords(null);
    router.push('/list');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>새 장소 기록</Text>

      <Pressable style={styles.photoFrame} onPress={pickPhotos}>
        {photoUris.length > 0 ? (
          <Image source={{ uri: photoUris[0] }} style={styles.photoPreview} />
        ) : (
          <Text style={styles.photoPlaceholder}>사진 선택 / 촬영</Text>
        )}
      </Pressable>

      <Text style={styles.label}>가게명</Text>
      <TextInput style={styles.inputSerif} value={name} onChangeText={setName} placeholder="이름을 적어주세요" />

      <Text style={styles.label}>주소 · GPS 자동입력</Text>
      <Pressable onPress={detectLocation}>
        <TextInput
          style={styles.inputMono}
          value={address}
          onChangeText={setAddress}
          placeholder={locating ? '위치 확인 중...' : '탭해서 현재 위치 가져오기'}
        />
      </Pressable>

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={styles.inputMono}
        value={memo}
        onChangeText={setMemo}
        placeholder="비 오는 날 가면 더 좋다..."
        multiline
      />

      <Pressable style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>오늘의 한 페이지 저장하기</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 18, gap: 14 },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink, marginBottom: 4 },
  photoFrame: {
    height: 180,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: '#EADFC6',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  photoPreview: { width: '100%', height: '100%', borderRadius: 2 },
  photoPlaceholder: { color: colors.ink },
  label: { fontSize: 11, letterSpacing: 1, color: '#8A8073', textTransform: 'uppercase' },
  inputSerif: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: 8,
  },
  inputMono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: 8,
  },
  saveButton: {
    backgroundColor: colors.stampRed,
    borderRadius: 5,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: { color: colors.paper, fontWeight: '600' },
});
```

- [ ] **Step 2: Relabel the tab**

In `app/(tabs)/_layout.tsx`, find the `Tabs.Screen` for `name="index"` and set its `title`/label to `'기록'`.

- [ ] **Step 3: Manual verification (Expo Go, real device)**

Run `npx expo start`, open in Expo Go:
1. Tap the photo frame → pick 2 photos from the library → thumbnail of the first shows.
2. Tap the address field → grant location permission → address auto-fills.
3. Type a name and memo → tap save.
4. Confirm it navigates to the list screen (list screen isn't built yet, so this may show a blank/error screen until Task 8 — that's expected at this point; the important check is that `save()` doesn't crash and the app doesn't hang).

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/index.tsx app/(tabs)/_layout.tsx
git commit -m "feat: build capture screen with photo picker, GPS address, and save"
```

---

### Task 8: List screen

**Files:**
- Modify: `app/(tabs)/explore.tsx` → rename to `app/(tabs)/list.tsx`
- Modify: `app/(tabs)/_layout.tsx` (point the second tab at `list`)

**Interfaces:**
- Consumes: `colors` (Task 2); `listPlaces` (Task 4); `Place` (Task 2).

- [ ] **Step 1: Rename the file**

```bash
git mv app/\(tabs\)/explore.tsx app/\(tabs\)/list.tsx
```

- [ ] **Step 2: Replace its content**

```tsx
// app/(tabs)/list.tsx
import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { colors } from '../../src/theme/tokens';
import { listPlaces } from '../../src/db/placesRepo';
import type { Place } from '../../src/types';

type MonthFilter = 'all' | 'this' | 'last';

function monthRange(offset: number): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export default function ListScreen() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all');

  const reload = useCallback(() => {
    const range = monthFilter === 'this' ? monthRange(0) : monthFilter === 'last' ? monthRange(-1) : {};
    setPlaces(listPlaces({ sort, query, ...range }));
  }, [sort, query, monthFilter]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Loci</Text>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={styles.account}>계정</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="이름, 주소로 검색"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={reload}
      />

      <View style={styles.filterRow}>
        <Pressable onPress={() => setSort('recent')}>
          <Text style={sort === 'recent' ? styles.filterActive : styles.filter}>최근순</Text>
        </Pressable>
        <Pressable onPress={() => setSort('name')}>
          <Text style={sort === 'name' ? styles.filterActive : styles.filter}>이름순</Text>
        </Pressable>
        <View style={{ width: 16 }} />
        <Pressable onPress={() => setMonthFilter('all')}>
          <Text style={monthFilter === 'all' ? styles.filterActive : styles.filter}>전체</Text>
        </Pressable>
        <Pressable onPress={() => setMonthFilter('this')}>
          <Text style={monthFilter === 'this' ? styles.filterActive : styles.filter}>이번달</Text>
        </Pressable>
        <Pressable onPress={() => setMonthFilter('last')}>
          <Text style={monthFilter === 'last' ? styles.filterActive : styles.filter}>지난달</Text>
        </Pressable>
      </View>

      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/place/${item.id}`)}>
            <View style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardAddr}>{item.address}</Text>
              <Text style={styles.cardMemo} numberOfLines={2}>
                {item.memo}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>아직 기록된 장소가 없어요.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  title: { fontSize: 24, color: colors.ink },
  account: { fontSize: 12, color: colors.sageOlive },
  search: { marginHorizontal: 18, marginTop: 10, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 8 },
  filterRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 18, paddingTop: 10, flexWrap: 'wrap' },
  filter: { fontSize: 12, color: '#8A8073' },
  filterActive: { fontSize: 12, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.gold },
  list: { padding: 18, gap: 12 },
  card: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingBottom: 12 },
  thumb: { width: 58, height: 58, backgroundColor: '#E3D7BD', borderRadius: 2 },
  cardName: { fontSize: 15, color: colors.ink },
  cardAddr: { fontSize: 11, color: colors.sageOlive },
  cardMemo: { fontSize: 12, color: '#5c554a' },
  empty: { textAlign: 'center', color: '#8A8073', marginTop: 40 },
});
```

- [ ] **Step 3: Point the tab config at the renamed file**

In `app/(tabs)/_layout.tsx`, change the `Tabs.Screen name="explore"` to `name="list"` and set its label to `'보관함'`.

- [ ] **Step 4: Manual verification (Expo Go, real device)**

1. From the capture screen, save a place → confirm it now lands on the list screen and shows the new card.
2. Type part of the name or address into search → confirm the list filters.
3. Tap 이름순/최근순 → confirm order changes.
4. Save two places in different months (or edit `created_at` via a quick debug query) and confirm 이번달/지난달 filters narrow the list correctly.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/list.tsx app/(tabs)/_layout.tsx
git commit -m "feat: build list screen with sort, keyword search, and month filter"
```

---

### Task 9: Detail screen

**Files:**
- Create: `app/place/[id].tsx`
- Modify: `app/_layout.tsx` (register the route)

**Interfaces:**
- Consumes: `colors` (Task 2); `getPlaceWithPhotos`, `updatePlace`, `deletePlace` (Task 4); `Place`, `Photo` (Task 2).

- [ ] **Step 1: Register the route in the root layout**

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="place/[id]" options={{ title: '' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the detail screen**

```tsx
// app/place/[id].tsx
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TextInput, Pressable, Alert, StyleSheet, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { getPlaceWithPhotos, updatePlace, deletePlace } from '../../src/db/placesRepo';
import type { Place, Photo } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!id) return;
    const result = getPlaceWithPhotos(id);
    if (!result) return;
    setPlace(result.place);
    setPhotos(result.photos);
    setName(result.place.name);
    setAddress(result.place.address);
    setMemo(result.place.memo);
  }, [id]);

  function saveEdits() {
    if (!place) return;
    updatePlace(place.id, { name, address, memo });
    setEditing(false);
    setPlace({ ...place, name, address, memo });
  }

  function confirmDelete() {
    if (!place) return;
    Alert.alert('삭제할까요?', `"${place.name}" 기록을 삭제합니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deletePlace(place.id);
          router.back();
        },
      },
    ]);
  }

  if (!place) return null;

  return (
    <ScrollView style={styles.screen}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {photos.map((photo) => (
          <Image key={photo.id} source={{ uri: photo.localUri }} style={{ width: screenWidth, height: 260 }} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {editing ? (
          <>
            <TextInput style={styles.inputSerif} value={name} onChangeText={setName} />
            <TextInput style={styles.inputMono} value={address} onChangeText={setAddress} />
            <TextInput style={styles.inputMono} value={memo} onChangeText={setMemo} multiline />
          </>
        ) : (
          <>
            <Text style={styles.name}>{place.name}</Text>
            <Text style={styles.addr}>{place.address}</Text>
            <Text style={styles.memo}>{place.memo}</Text>
          </>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={() => (editing ? saveEdits() : setEditing(true))}>
            <Text>{editing ? '저장' : '수정'}</Text>
          </Pressable>
          <Pressable style={[styles.iconBtn, styles.deleteBtn]} onPress={confirmDelete}>
            <Text style={{ color: colors.stampRed }}>삭제</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { padding: 18, gap: 10 },
  name: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  addr: { fontFamily: fonts.mono, fontSize: 12, color: colors.sageOlive },
  memo: { fontFamily: fonts.serifItalic, fontSize: 14, color: '#4A3728', marginTop: 8 },
  inputSerif: { fontFamily: fonts.serif, fontSize: 20, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  inputMono: { fontFamily: fonts.mono, fontSize: 13, borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  iconBtn: { borderWidth: 1, borderColor: colors.mist, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 16 },
  deleteBtn: { borderColor: colors.stampRed },
});
```

- [ ] **Step 3: Manual verification (Expo Go, real device)**

1. From the list screen, tap a card → detail screen opens showing its photo(s), name, address, memo.
2. Swipe horizontally through photos if there's more than one.
3. Tap 수정 → change the memo → tap 저장 → confirm it updates and persists (go back to list and re-open the detail to check).
4. Tap 삭제 → confirm the alert → confirm it returns to the list and the card is gone.

- [ ] **Step 4: Commit**

```bash
git add app/place app/_layout.tsx
git commit -m "feat: build detail screen with photo swipe, edit, and delete"
```

---

### Task 10: Login screen, auth gate entry point, and cloud pull-on-login

**Files:**
- Create: `src/sync/pull.ts`
- Create: `app/login.tsx`
- Modify: `app/_layout.tsx` (register the `login` route)
- Test: `src/sync/pull.test.ts`

**Interfaces:**
- Consumes: `signIn`, `signUp`, `signOut` (Task 3); `supabase` (Task 3); `listPlaces`, `upsertRemotePlace` (Task 4); `Place` (Task 2).
- Produces: `placesToPull(remoteIds, localIds): string[]` (pure, tested), `pullRemotePlaces(userId): Promise<void>` — consumed by `app/login.tsx`.

- [ ] **Step 1: Write the failing tests for the pull-diff calculation**

```ts
// src/sync/pull.test.ts
import { placesToPull } from './pull';

describe('placesToPull', () => {
  test('returns remote ids missing locally', () => {
    expect(placesToPull(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });

  test('returns empty when everything is already local', () => {
    expect(placesToPull(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  test('returns all remote ids when local is empty', () => {
    expect(placesToPull(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/sync/pull.test.ts
```

Expected: FAIL — `./pull` module not found.

- [ ] **Step 3: Write the pull module**

```ts
// src/sync/pull.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/sync/pull.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Write the login screen**

```tsx
// app/login.tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme/tokens';
import { signIn, signUp, signOut } from '../src/supabase/auth';
import { supabase } from '../src/supabase/client';
import { pullRemotePlaces } from '../src/sync/pull';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ email: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession({ email: data.session.user.email ?? '' });
    });
  }, []);

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (userId) {
        await pullRemotePlaces(userId);
        setSession({ email: data.session!.user.email ?? '' });
      }
      router.replace('/list');
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut();
    setSession(null);
  }

  if (session) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Loci</Text>
        <Text style={styles.subtitle}>{session.email}로 로그인됨</Text>
        <Pressable style={styles.button} onPress={logout}>
          <Text style={styles.buttonText}>로그아웃</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Loci</Text>
      <Text style={styles.subtitle}>클라우드 백업을 위해 로그인하세요</Text>

      <TextInput
        style={styles.input}
        placeholder="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />

      <Pressable style={styles.button} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? '처리 중...' : mode === 'signIn' ? '로그인' : '회원가입'}</Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        <Text style={styles.switch}>{mode === 'signIn' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/list')}>
        <Text style={styles.skip}>나중에 하기 (로그인 없이 계속)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 32, color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.sageOlive, textAlign: 'center', marginBottom: 20 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.mist, paddingVertical: 10 },
  button: { backgroundColor: colors.stampRed, borderRadius: 5, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: colors.paper, fontWeight: '600' },
  switch: { textAlign: 'center', color: colors.sageOlive, marginTop: 16, fontSize: 12 },
  skip: { textAlign: 'center', color: '#8A8073', marginTop: 8, fontSize: 12 },
});
```

- [ ] **Step 6: Register the route**

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="place/[id]" options={{ title: '' }} />
      <Stack.Screen name="login" options={{ title: '계정', presentation: 'modal' }} />
    </Stack>
  );
}
```

- [ ] **Step 7: Manual verification (Expo Go, real device)**

1. From the list screen, tap 계정 → login screen opens.
2. Tap 회원가입, create a test account → confirm no error and it returns to the list.
3. Force-close and reopen the app → tap 계정 again → confirm it now shows the logged-in email and a 로그아웃 button instead of the form (session persisted via AsyncStorage).
4. On a second device or after clearing local app storage, log in with the same account → confirm previously-saved places appear in the list (pulled from Supabase).
5. Tap 로그아웃 → confirm it returns to the signed-out form, and the app still works locally afterward.

- [ ] **Step 8: Commit**

```bash
git add src/sync/pull.ts src/sync/pull.test.ts app/login.tsx app/_layout.tsx
git commit -m "feat: add login screen, session persistence, and cloud pull-on-login"
```

---

## Post-plan check

Run the full automated suite once all tasks are done:

```bash
npx tsc --noEmit
npx jest
```

Expected: no type errors, all unit tests passing (auth error mapping, query builder, address formatting, sync queue, pull-diff — 5 test files, 22 tests total). Then do one final end-to-end pass on a real device via Expo Go covering the full golden path from the design spec: 오프라인 상태에서 촬영·저장 → 리스트 확인 → 상세에서 수정/삭제 → 네트워크 재연결 후 동기화 확인 → 로그인 후 클라우드 기록 다운로드 확인.
