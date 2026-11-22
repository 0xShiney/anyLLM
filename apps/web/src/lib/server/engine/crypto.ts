import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Satu kunci master di env; kunci per project diturunkan dengan HKDF.
const MASTER = process.env.LOG_ENCRYPTION_KEY ?? 'dev-log-key-not-for-production';

function keyFor(projectId: string): Buffer {
	return Buffer.from(hkdfSync('sha256', MASTER, 'anyllm-prompt-log', projectId, 32));
}

export function encryptFor(projectId: string, plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', keyFor(projectId), iv);
	cipher.setAAD(Buffer.from(projectId));
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function decryptFor(projectId: string, payload: string): string {
	const [ivB64, tagB64, ctB64] = payload.split('.');
	const decipher = createDecipheriv('aes-256-gcm', keyFor(projectId), Buffer.from(ivB64, 'base64'));
	decipher.setAAD(Buffer.from(projectId));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
