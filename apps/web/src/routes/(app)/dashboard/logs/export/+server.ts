import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const rows = getDb()
		.prepare(
			`SELECT request_id, created_at, model, provider, tag, prompt_tokens, completion_tokens, cached_tokens,
			 cost_micros, billed_micros, latency_ms, status, stream
			 FROM usage WHERE org_id = ? ORDER BY created_at DESC LIMIT 5000`
		)
		.all(locals.user.orgId) as unknown as Record<string, string | number>[];

	const header = ['request_id', 'created_at', 'model', 'provider', 'tag', 'prompt_tokens', 'completion_tokens', 'cached_tokens', 'cost_idr', 'billed_idr', 'latency_ms', 'status', 'stream'];
	const lines = rows.map((r) =>
		header
			.map((key) => {
				let value = r[key] ?? '';
				if (key.endsWith('_idr')) value = (Number(value) / 1_000_000).toFixed(2);
				const text = String(value).replace(/"/g, '""');
				return /[",\n]/.test(text) ? `"${text}"` : text;
			})
			.join(',')
	);

	return new Response([header.join(','), ...lines].join('\n'), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="anyllm-usage.csv"'
		}
	});
};
