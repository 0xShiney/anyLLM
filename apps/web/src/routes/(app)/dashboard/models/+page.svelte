<script lang="ts">
	import { rp, pct, ms } from '$lib/format';
	let { data } = $props();
	const alias = [
		{ name: 'auto-murah', body: 'Model dengan harga input+output terendah, lalu dua fallback termurah berikutnya.' },
		{ name: 'auto-cepat', body: 'Model dengan latency rata-rata terendah pada 7 hari terakhir.' },
		{ name: '@preset/<slug>', body: 'Daftar model tersimpan beserta parameter dan system prompt.' }
	];
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Models</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Harga jual per 1 juta token. Kesehatan dihitung dari request 7 hari terakhir.
	</p>
</header>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
	{#each alias as a}
		<div class="card card-pad">
			<div class="num" style="font-size:13px">{a.name}</div>
			<p class="hint" style="margin-top:4px">{a.body}</p>
		</div>
	{/each}
</div>

<div class="card" style="overflow:hidden">
	<table class="table">
		<thead>
			<tr>
				<th>Model</th><th>Provider</th><th class="r">Input</th><th class="r">Output</th><th class="r">Konteks</th>
				<th class="r">Latency</th><th class="r">Sukses 7 h</th><th class="r">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each data.models as m}
				<tr>
					<td>
						<div style="font-size:13px">{m.label}</div>
						<div class="num" style="font-size:11px;color:var(--ink-faint)">{m.id}</div>
					</td>
					<td style="text-transform:capitalize;font-size:13px;color:var(--ink-soft)">{m.provider}</td>
					<td class="r num">{rp(Number(m.input_micros) * (1 + Number(m.markup_pct) / 100))}</td>
					<td class="r num">{rp(Number(m.output_micros) * (1 + Number(m.markup_pct) / 100))}</td>
					<td class="r num" style="color:var(--ink-soft)">{(Number(m.context) / 1000).toLocaleString('id-ID')} rb</td>
					<td class="r num">{m.health ? ms(Number(m.health.latency)) : '—'}</td>
					<td class="r num">{m.health ? pct(Number(m.health.success) * 100) : '—'}</td>
					<td class="r">
						{#if !m.enabled}
							<span class="badge badge-danger">nonaktif</span>
						{:else if m.health && Number(m.health.success) < 0.98}
							<span class="badge badge-warn">degradasi</span>
						{:else}
							<span class="badge badge-ok">aktif</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<div style="padding:12px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-faint)">
		Harga katalog berstatus demo dan belum diverifikasi ke dokumentasi provider.
	</div>
</div>

<h2 style="font-size:20px;margin-top:32px">Kebijakan data provider</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	<table class="table">
		<thead><tr><th>Provider</th><th>Retensi</th><th>Latihan model</th><th>ZDR</th><th class="r">Diverifikasi</th></tr></thead>
		<tbody>
			{#each data.policies as p}
				<tr>
					<td style="text-transform:capitalize">{p.provider}</td>
					<td style="font-size:13px;color:var(--ink-soft)">{p.retention}</td>
					<td>{p.trains_on_data ? 'Ya' : 'Tidak'}</td>
					<td>{p.zdr_available ? 'Tersedia' : 'Belum diketahui'}</td>
					<td class="r num" style="font-size:12px;color:var(--ink-faint)">{p.verified_at ?? '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
