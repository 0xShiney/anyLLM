<script lang="ts">
	import { page } from '$app/state';
	const user = $derived(page.data.user ?? null);
	const links = [
		{ href: '/pricing', label: 'Harga' },
		{ href: '/docs', label: 'Dokumentasi' },
		{ href: '/status', label: 'Status' }
	];
</script>

<header style="border-bottom:1px solid var(--line);background:var(--paper)">
	<div class="wrap" style="display:flex;align-items:center;justify-content:space-between;height:56px;max-width:1120px;margin:0 auto;padding:0 32px">
		<a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink)">
			<span style="width:16px;height:16px;border:1px solid var(--ink);border-radius:2px;position:relative;display:inline-block">
				<span style="position:absolute;inset:4px;background:var(--accent);border-radius:1px"></span>
			</span>
			<span style="font-family:var(--font-display);font-size:18px;letter-spacing:-0.02em">anyLLM</span>
		</a>
		<nav style="display:flex;align-items:center;gap:22px">
			{#each links as l}
				<a
					href={l.href}
					style="font-size:13px;text-decoration:none;color:{page.url.pathname === l.href ? 'var(--ink)' : 'var(--ink-soft)'}"
					aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a
				>
			{/each}
			<span style="width:1px;height:18px;background:var(--line)"></span>
			{#if user}
				<a class="btn btn-sm" href={user.role === 'customer' ? '/dashboard' : '/admin'}>Buka dashboard</a>
			{:else}
				<a href="/login" style="font-size:13px;text-decoration:none;color:var(--ink-soft)">Masuk</a>
				<a class="btn btn-sm btn-primary" href="/signup">Mulai</a>
			{/if}
		</nav>
	</div>
</header>
