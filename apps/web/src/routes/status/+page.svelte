<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import { dateOnly } from '$lib/format';
	let { data } = $props();
</script>

<PublicNav />
<main style="max-width:1120px;margin:0 auto;padding:48px 32px 72px">
	<div class="label" style="margin-bottom:14px">Status</div>
	<h1 style="font-size:36px;line-height:1.12">Ketersediaan per provider</h1>
	<p style="margin-top:12px;color:var(--ink-soft);max-width:56ch">
		Dihitung dari request 7 hari terakhir pada gateway, termasuk fallback. Angka mencerminkan pengalaman pelanggan,
		bukan status resmi provider.
	</p>

	<div class="card" style="margin-top:28px;overflow:hidden">
		<table class="table">
			<thead><tr><th>Provider</th><th class="r">Request 7 hari</th><th class="r">Sukses</th><th class="r">Latency rata-rata</th><th class="r">Status</th></tr></thead>
			<tbody>
				{#each data.providers as p}
					<tr>
						<td style="text-transform:capitalize">{p.provider}</td>
						<td class="r num">{p.requests.toLocaleString('id-ID')}</td>
						<td class="r num">{(p.success * 100).toFixed(2).replace('.', ',')}%</td>
						<td class="r num">{Math.round(p.latency)} ms</td>
						<td class="r">
							{#if p.success >= 0.99}
								<span class="badge badge-ok">Normal</span>
							{:else if p.success >= 0.95}
								<span class="badge badge-warn">Degradasi</span>
							{:else}
								<span class="badge badge-danger">Gangguan</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2 style="font-size:22px;margin-top:40px">Kebijakan data per provider</h2>
	<p class="hint" style="margin-top:6px">Kolom tanggal terakhir diverifikasi kosong berarti admin belum memverifikasi dari dokumen resmi.</p>
	<div class="card" style="margin-top:14px;overflow:hidden">
		<table class="table">
			<thead><tr><th>Provider</th><th>Retensi</th><th>Dipakai untuk latihan</th><th>Zero retention tersedia</th><th class="r">Diverifikasi</th></tr></thead>
			<tbody>
				{#each data.policies as p}
					<tr>
						<td style="text-transform:capitalize">{p.provider}</td>
						<td style="font-size:13px;color:var(--ink-soft)">{p.retention}</td>
						<td style="font-size:13px">{p.trains_on_data ? 'Ya' : 'Tidak'}</td>
						<td style="font-size:13px">{p.zdr_available ? 'Ya' : 'Tidak diketahui'}</td>
						<td class="r num" style="font-size:12px;color:var(--ink-faint)">{p.verified_at ? dateOnly(String(p.verified_at)) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.incidents.length}
		<h2 style="font-size:22px;margin-top:40px">Catatan operasional</h2>
		<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
			{#each data.incidents as i}
				<div class="card card-pad" style="font-size:13px;color:var(--ink-soft)">{i.body}</div>
			{/each}
		</div>
	{/if}
</main>
