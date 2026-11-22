import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA } from './schema';
import { seed } from './seed';

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
	if (instance) return instance;
	const file = process.env.DATABASE_PATH ?? 'data/anyllm.db';
	mkdirSync(dirname(file), { recursive: true });
	const db = new DatabaseSync(file);
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('PRAGMA busy_timeout = 3000');
	db.exec(SCHEMA);
	seed(db);
	instance = db;
	return db;
}

/** Untuk test: database baru tanpa data demo. */
export function openDb(file = ':memory:'): DatabaseSync {
	const db = new DatabaseSync(file);
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(SCHEMA);
	return db;
}
