import { error, redirect } from '@sveltejs/kit';
import { isStaff } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (!isStaff(locals.user)) error(403, 'Halaman ini hanya untuk staf platform.');
	return { user: locals.user };
};
