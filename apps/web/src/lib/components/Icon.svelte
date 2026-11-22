<script lang="ts">
	const { name, size = 15, stroke = 1.6 } = $props();

	const paths: Record<string, string> = {
		grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
		key: 'M4 8a4 4 0 1 1 8 0c0 1.6-.9 3-2.3 3.6L9 12v2H7v2H4v-3l4.6-4.6A4 4 0 0 1 4 8z',
		cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
		list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
		replay: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
		route: 'M6 3v12a3 3 0 0 0 3 3h9M6 21a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM18 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
		layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
		terminal: 'M4 4h16v16H4zM8 9l3 3-3 3M13 15h4',
		card: 'M2 6h20v12H2zM2 10h20',
		users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM22 20v-2a4 4 0 0 0-3-3.9M16 4a3 3 0 0 1 0 6',
		ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM12 6v10',
		sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
		shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z',
		chart: 'M3 3v18h18M7 15l3-4 3 3 5-7',
		check: 'M20 6L9 17l-5-5',
		x: 'M18 6L6 18M6 6l12 12',
		plus: 'M12 5v14M5 12h14',
		search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
		alert: 'M12 3l9 16H3l9-16zM12 9v5M12 17h.01',
		clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2',
		arrow: 'M5 12h14M13 6l6 6-6 6',
		out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
		book: 'M4 4h16v16H4zM4 9h16M8 4v16',
		tag: 'M20 12l-8 8-8-8V4h8l8 8zM8 8h.01',
		bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
		down: 'M12 5v14M6 13l6 6 6-6',
		filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	style="flex:none"
>
	<path d={paths[name] ?? paths.grid} />
</svg>
