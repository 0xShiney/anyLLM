import { createHmac, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Webhook keluar dengan tanda tangan HMAC-SHA256. Satu percobaan, kegagalan
 * dicatat sebagai notifikasi (retry terjadwal belum ada).
 * shortcut: tanpa retry/backoff, tambahkan queue saat volume webhook naik.
 */
export async function dispatch(db: DatabaseSync, orgId: string, event: string, payload: Record<string, unknown>): Promise<number> {
	const hooks = db
		.prepare("SELECT id, url, secret, events FROM webhooks WHERE org_id = ? AND active = 1")
		.all(orgId) as unknown as { id: string; url: string; secret: string; events: string }[];
	const targets = hooks.filter((h) => h.events.split(',').map((e) => e.trim()).includes(event));
	await Promise.all(
		targets.map(async (hook) => {
			const body = JSON.stringify({ id: randomUUID(), event, created_at: new Date().toISOString(), data: payload });
			const signature = createHmac('sha256', hook.secret).update(body).digest('hex');
			try {
				const res = await fetch(hook.url, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-anyllm-signature': `sha256=${signature}`, 'x-anyllm-event': event },
					body,
					signal: AbortSignal.timeout(8000)
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
			} catch (err) {
				db.prepare('INSERT INTO notifications (org_id, kind, body, read, created_at) VALUES (?,?,?,0,?)').run(
					orgId,
					'webhook_failed',
					`Webhook ${event} ke ${hook.url} gagal: ${(err as Error).message}`,
					new Date().toISOString()
				);
			}
		})
	);
	return targets.length;
}
