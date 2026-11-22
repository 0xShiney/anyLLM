<script lang="ts">
	let { label, value, hint = '', delta = null, accent = false } = $props();
</script>

<div class="card card-pad" style="display:flex;flex-direction:column;gap:6px;min-width:0">
	<div class="label">{label}</div>
	<div class="num" style="font-size:24px;line-height:1.2;letter-spacing:-0.01em;color:{accent ? 'var(--accent)' : 'var(--ink)'}">
		{value}
	</div>
	<div style="display:flex;align-items:center;gap:8px;min-height:18px">
		{#if delta !== null}
			<span class="num" style="font-size:12px;color:{delta >= 0 ? 'var(--accent)' : 'var(--danger)'}">
				{delta >= 0 ? '+' : ''}{delta.toFixed(1).replace('.', ',')}%
			</span>
			<span style="font-size:12px;color:var(--ink-faint)">vs 30 hari sebelumnya</span>
		{:else}
			<span style="font-size:12px;color:var(--ink-faint)">{hint}</span>
		{/if}
	</div>
</div>
