<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	let { data, children } = $props();
	const sections = [
		{
			items: [
				{ href: '/dashboard', label: 'Ringkasan', icon: 'grid' },
				{ href: '/dashboard/keys', label: 'API Keys', icon: 'key' },
				{ href: '/dashboard/models', label: 'Models', icon: 'cube' },
				{ href: '/dashboard/logs', label: 'Logs', icon: 'list' }
			]
		},
		{
			label: 'Optimasi',
			items: [
				{ href: '/dashboard/replay', label: 'Replay Lab', icon: 'replay' },
				{ href: '/dashboard/routing', label: 'Routing Rules', icon: 'route' },
				{ href: '/dashboard/presets', label: 'Presets', icon: 'layers' },
				{ href: '/dashboard/playground', label: 'Playground', icon: 'terminal' }
			]
		},
		{
			label: 'Akun',
			items: [
				{ href: '/dashboard/billing', label: 'Billing', icon: 'card' },
				{ href: '/dashboard/team', label: 'Workspace', icon: 'users' },
				{ href: '/dashboard/tickets', label: 'Tiket', icon: 'ticket' }
			]
		}
	];
</script>

<div style="display:flex;align-items:stretch;min-height:100vh">
	<Sidebar {sections} user={data.user} footer={{ href: '/dashboard/settings', label: 'Pengaturan' }} adminLink={data.user.role !== 'customer'} />
	<main style="flex:1;min-width:0">
		<div style="max-width:1120px;margin:0 auto;padding:28px 32px 64px">
			{@render children()}
		</div>
	</main>
</div>
