<script lang="ts">
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	let {
		sections = [],
		user,
		footer = null,
		adminLink = false
	}: {
		sections: { label?: string; items: { href: string; label: string; icon: string }[] }[];
		user: { name: string; email: string; role: string; orgName: string };
		footer?: { href: string; label: string } | null;
		adminLink?: boolean;
	} = $props();

	const isActive = (href: string) => {
		const path = page.url.pathname;
		return path === href || (href !== '/dashboard' && href !== '/admin' && path.startsWith(href));
	};
</script>

<aside
	style="width:224px;flex:none;border-right:1px solid var(--line);height:100vh;position:sticky;top:0;display:flex;flex-direction:column;background:var(--paper)"
>
	<a href="/dashboard" style="display:flex;align-items:center;gap:8px;padding:16px;text-decoration:none;color:var(--ink)">
		<span style="width:15px;height:15px;border:1px solid var(--ink);border-radius:2px;position:relative;display:inline-block">
			<span style="position:absolute;inset:3.5px;background:var(--accent);border-radius:1px"></span>
		</span>
		<span style="font-family:var(--font-display);font-size:17px;letter-spacing:-0.02em">anyLLM</span>
	</a>

	<div style="padding:0 10px 10px">
		<div class="label" style="padding:0 6px 6px">Workspace</div>
		<div style="font-size:13px;padding:0 6px;display:flex;justify-content:space-between;gap:8px">
			<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{user.orgName}</span>
			<span class="badge" style="font-size:10px">{user.role === 'customer' ? user.role : user.role}</span>
		</div>
	</div>

	<nav style="flex:1;overflow-y:auto;padding:0 10px 16px;display:flex;flex-direction:column;gap:14px">
		{#each sections as section}
			<div>
				{#if section.label}
					<div class="label" style="padding:0 6px 6px">{section.label}</div>
				{/if}
				<div style="display:flex;flex-direction:column;gap:1px">
					{#each section.items as item}
						<a
							href={item.href}
							class="nav-link"
							aria-current={isActive(item.href) ? 'page' : undefined}
						>
							<span style="display:flex;align-items:center;gap:9px">
								<Icon name={item.icon} size={14} />
								{item.label}
							</span>
						</a>
					{/each}
				</div>
			</div>
		{/each}
		{#if adminLink}
			<div>
				<div class="label" style="padding:0 6px 6px">Platform</div>
				<a href="/admin" class="nav-link" aria-current={isActive('/admin') ? 'page' : undefined}>
					<span style="display:flex;align-items:center;gap:9px"><Icon name="shield" size={14} />Panel admin</span>
				</a>
			</div>
		{/if}
		{#if footer}
			<a href={footer.href} class="nav-link" aria-current={isActive(footer.href) ? 'page' : undefined}>
				<span style="display:flex;align-items:center;gap:9px"><Icon name="sliders" size={14} />{footer.label}</span>
			</a>
		{/if}
	</nav>

	<div style="border-top:1px solid var(--line);padding:12px 16px">
		<div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{user.name}</div>
		<div style="font-size:11px;color:var(--ink-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{user.email}</div>
		<form method="POST" action="/logout" style="margin-top:8px">
			<button class="btn btn-ghost btn-sm" type="submit" style="padding:0;height:22px">
				<Icon name="out" size={12} />Keluar
			</button>
		</form>
	</div>
</aside>
