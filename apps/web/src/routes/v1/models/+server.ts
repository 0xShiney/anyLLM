import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { authenticate } from '$lib/server/engine/gateway';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
	const raw = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
	if (!raw) return json({ error: { type: 'invalid_api_key', message: 'Authorization Bearer wajib diisi.' } }, { status: 401 });
	if (!authenticate(getDb(), raw))
		return json({ error: { type: 'invalid_api_key', message: 'Kunci API tidak valid.' } }, { status: 401 });

	const rows = getDb()
		.prepare('SELECT id, provider FROM models WHERE enabled = 1 AND visible = 1 ORDER BY sort')
		.all() as unknown as { id: string; provider: string }[];
	const created = Math.floor(Date.now() / 1000);
	return json({
		object: 'list',
		data: [
			...['auto-murah', 'auto-cepat'].map((id) => ({ id, object: 'model', created, owned_by: 'anyllm' })),
			...rows.map((m) => ({ id: m.id, object: 'model', created, owned_by: m.provider }))
		]
	});
};
