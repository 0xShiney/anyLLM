import { getDb } from '$lib/server/db';

export function load() {
	const db = getDb();
	const models = db
		.prepare('SELECT id, label FROM models WHERE visible = 1 AND enabled = 1 ORDER BY sort')
		.all() as unknown as { id: string; label: string }[];
	const presets = db.prepare('SELECT slug FROM presets ORDER BY slug DESC LIMIT 3').all() as unknown as { slug: string }[];
	return { models, presets };
}
