import { fail, redirect } from '@sveltejs/kit';
import { createSession, login, sessionCookie } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { email, error: 'Email dan password wajib diisi.' });
		const user = login(email, password);
		if (!user) return fail(401, { email, error: 'Email atau password salah.' });
		sessionCookie(cookies, createSession(user.id));
		const next = url.searchParams.get('next');
		redirect(303, next && next.startsWith('/') ? next : user.role === 'customer' ? '/dashboard' : '/admin');
	}
};
