<script lang="ts">
	let {
		points = [],
		height = 128,
		format = (n: number) => String(n),
		color = 'var(--accent)',
		fill = true,
		label = ''
	}: {
		points: { label: string; value: number }[];
		height?: number;
		format?: (n: number) => string;
		color?: string;
		fill?: boolean;
		label?: string;
	} = $props();

	const W = 640;
	const H = $derived(height);
	const pad = { top: 10, right: 8, bottom: 18, left: 8 };

	const max = $derived(Math.max(1, ...points.map((p) => p.value)));
	const stepX = $derived(points.length > 1 ? (W - pad.left - pad.right) / (points.length - 1) : 0);
	const coords = $derived(
		points.map((p, i) => {
			const x = pad.left + i * stepX;
			const y = pad.top + (1 - p.value / max) * (H - pad.top - pad.bottom);
			return { x, y, ...p };
		})
	);
	const line = $derived(coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '));
	const area = $derived(
		coords.length
			? `${line} L${coords[coords.length - 1].x.toFixed(1)},${H - pad.bottom} L${coords[0].x.toFixed(1)},${H - pad.bottom} Z`
			: ''
	);
</script>

<div>
	{#if label}
		<div class="label" style="margin-bottom:6px">{label}</div>
	{/if}
	<svg viewBox="0 0 {W} {H}" width="100%" height={H} role="img" aria-label={label || 'grafik'}>
		{#each [0, 0.25, 0.5, 0.75, 1] as t}
			<line
				x1={pad.left}
				x2={W - pad.right}
				y1={pad.top + t * (H - pad.top - pad.bottom)}
				y2={pad.top + t * (H - pad.top - pad.bottom)}
				stroke="var(--line)"
				stroke-width="1"
				stroke-dasharray="2 4"
			/>
		{/each}
		{#if fill && area}
			<path d={area} fill={color} opacity="0.06" />
		{/if}
		{#if line}
			<path d={line} fill="none" stroke={color} stroke-width="1.5" stroke-linejoin="round" />
		{/if}
		{#each coords as c, i}
			{#if i === coords.length - 1}
				<circle cx={c.x} cy={c.y} r="2.5" fill={color} />
				<text x={c.x - 4} y={c.y - 7} text-anchor="end" font-size="10" fill="var(--ink-soft)" class="num">
					{format(c.value)}
				</text>
			{/if}
		{/each}
		{#if coords.length > 1}
			<text x={pad.left} y={H - 4} font-size="10" fill="var(--ink-faint)">{coords[0].label}</text>
			<text x={W - pad.right} y={H - 4} text-anchor="end" font-size="10" fill="var(--ink-faint)">
				{coords[coords.length - 1].label}
			</text>
		{/if}
	</svg>
</div>
