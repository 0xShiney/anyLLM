<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	let { data, children } = $props();
	const sections = [
		{
			items: [
				{ href: '/admin', label: 'Ops', icon: 'chart' },
				{ href: '/admin/models', label: 'Model & Harga', icon: 'cube' },
				{ href: '/admin/customers', label: 'Customer', icon: 'users' }
			]
		},
		{
			label: 'Keuangan',
			items: [
				{ href: '/admin/finance', label: 'Ledger & Refund', icon: 'card' },
				{ href: '/admin/promos', label: 'Promo', icon: 'tag' }
			]
		},
		{
			label: 'Layanan',
			items: [
				{ href: '/admin/tickets', label: 'Tiket', icon: 'ticket' },
				{ href: '/admin/audit', label: 'Audit Log', icon: 'shield' }
			]
		}
	];
</script>

<div style="display:flex;min-height:100vh">
	<Sidebar {sections} user={data.user} footer={{ href: '/dashboard', label: 'Kembali ke dashboard' }} />
	<main style="flex:1;min-width:0">
		<div style="max-width:1120px;margin:0 auto;padding:28px 32px 64px">
			{@render children()}
		</div>
	</main>
</div>
