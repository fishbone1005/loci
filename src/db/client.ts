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
