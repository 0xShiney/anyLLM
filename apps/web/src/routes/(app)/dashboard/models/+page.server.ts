import { getDb } from '$lib/server/db';
import { listModels } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		models: listModels(db),
		policies: db.prepare('SELECT * FROM data_policies ORDER BY provider').all() as unknown as Record<string, string | number>[]
	};
};
