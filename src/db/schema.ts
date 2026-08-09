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
`;
