<script lang="ts">
	let {
		rows = [],
		format = (n: number) => String(n)
	}: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string } = $props();
	const max = $derived(Math.max(1, ...rows.map((r) => r.value)));
</script>

<div style="display:flex;flex-direction:column;gap:12px">
	{#each rows as r}
		<div>
			<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:5px;min-width:0">
				<span style="font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{r.label}</span>
				<span class="num" style="font-size:12px;color:var(--ink-soft);flex:none">
					{format(r.value)}{#if r.sub}<span style="color:var(--ink-faint)"> · {r.sub}</span>{/if}
				</span>
			</div>
			<div style="height:4px;background:var(--surface-sunken);border-radius:1px;overflow:hidden">
				<div style="height:100%;width:{(r.value / max) * 100}%;background:var(--accent);opacity:0.75"></div>
			</div>
		</div>
	{/each}
	{#if rows.length === 0}
		<p style="font-size:13px;color:var(--ink-faint)">Belum ada data.</p>
	{/if}
</div>
