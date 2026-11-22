<script lang="ts">
	import Icon from './Icon.svelte';
	let {
		title,
		body = '',
		icon = 'list',
		actionLabel = '',
		actionHref = ''
	}: { title: string; body?: string; icon?: string; actionLabel?: string; actionHref?: string } = $props();
</script>

<div class="card card-pad" style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:28px 24px">
	<div
		style="width:28px;height:28px;border:1px solid var(--line);border-radius:3px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint)"
	>
		<Icon name={icon} size={14} />
	</div>
	<div>
		<div style="font-size:14px;font-weight:500">{title}</div>
		{#if body}<p style="font-size:13px;color:var(--ink-soft);margin-top:2px;max-width:52ch">{body}</p>{/if}
	</div>
	{#if actionLabel && actionHref}
		<a class="btn btn-sm" href={actionHref}>{actionLabel}</a>
	{/if}
</div>
