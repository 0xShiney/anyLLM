import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { userFromCookies } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	getDb();
	event.locals.user = userFromCookies(event.cookies);
	const res = await resolve(event);
	res.headers.set('x-content-type-options', 'nosniff');
	res.headers.set('referrer-policy', 'same-origin');
	res.headers.set('x-frame-options', 'SAMEORIGIN');
	return res;
};
