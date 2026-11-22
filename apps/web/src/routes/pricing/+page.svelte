<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import { rp } from '$lib/format';
	let { data } = $props();
</script>

<PublicNav />
<main style="max-width:1120px;margin:0 auto;padding:48px 32px 72px">
	<div class="label" style="margin-bottom:14px">Harga</div>
	<h1 style="font-size:40px;line-height:1.1;max-width:22ch">Bayar sesuai token. Markup terlihat di setiap baris.</h1>
	<p style="margin-top:16px;color:var(--ink-soft);max-width:58ch">
		Harga di bawah adalah harga jual (harga modal provider ditambah markup). Tagihan memakai rupiah; kurs USD/IDR dicatat
		pada transaksi top up. Tidak ada biaya langganan.
	</p>
	<p class="hint" style="margin-top:8px">
		Harga katalog saat ini berstatus demo dan belum diverifikasi ke dokumentasi provider. Admin dapat memperbarui lewat panel
		admin dan riwayat perubahannya tersimpan.
	</p>

	<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin-top:32px;align-items:start">
		<div class="card" style="overflow:hidden">
			<table class="table">
				<thead>
					<tr>
						<th>Model</th><th class="r">Input</th><th class="r">Output</th><th class="r">Cache read</th><th class="r">Konteks</th>
					</tr>
				</thead>
				<tbody>
					{#each data.models as m}
						<tr>
							<td>
								<div style="font-size:13px">{m.label}</div>
								<div class="num" style="font-size:11px;color:var(--ink-faint)">{m.id}</div>
							</td>
							<td class="r num">{rp(m.input)}</td>
							<td class="r num">{rp(m.output)}</td>
							<td class="r num" style="color:var(--ink-soft)">{m.cached ? rp(m.cached) : '—'}</td>
							<td class="r num" style="color:var(--ink-soft)">{(m.context / 1000).toLocaleString('id-ID')} rb</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div style="padding:12px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-faint)">
				Harga per 1 juta token, sudah termasuk markup 12–18% per model.
			</div>
		</div>

		<form method="GET" class="card card-pad" style="display:flex;flex-direction:column;gap:14px">
			<div>
				<div style="font-size:14px;font-weight:500">Kalkulator biaya</div>
				<div class="hint">Perkiraan kasar, bukan penawaran.</div>
			</div>
			<div class="field">
				<label class="label" for="model">Model</label>
				<select class="select" id="model" name="model">
					{#each data.models as m}
						<option value={m.id} selected={m.id === data.calc.modelId}>{m.label}</option>
					{/each}
				</select>
			</div>
			<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
				<div class="field">
					<label class="label" for="requests">Request / hari</label>
					<input class="input num" id="requests" name="requests" type="number" min="0" value={data.calc.perDay} />
				</div>
				<div class="field">
					<label class="label" for="in">Token masuk</label>
					<input class="input num" id="in" name="in" type="number" min="0" value={data.calc.tokensIn} />
				</div>
				<div class="field">
					<label class="label" for="out">Token keluar</label>
					<input class="input num" id="out" name="out" type="number" min="0" value={data.calc.tokensOut} />
				</div>
			</div>
			<button class="btn" type="submit">Hitung</button>
			<div style="border-top:1px solid var(--line);padding-top:14px">
				<div class="label">Perkiraan biaya bulanan</div>
				<div class="num" style="font-size:28px;margin:6px 0">{rp(data.calc.monthlyMicros)}</div>
				<div class="hint">
					Model termurah di katalog: <span class="num">{data.calc.cheapest}</span> ≈
					<span class="num">{rp(data.calc.cheapestMicros)}</span>
				</div>
			</div>
		</form>
	</div>

	<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:32px">
		{#each [{ t: 'Top up minimum', v: 'Rp25.000' }, { t: 'Biaya langganan', v: 'Tidak ada' }, { t: 'Kredit kedaluwarsa', v: 'Belum ditetapkan' }] as x}
			<div class="card card-pad">
				<div class="label">{x.t}</div>
				<div style="font-size:16px;margin-top:6px">{x.v}</div>
			</div>
		{/each}
	</div>
</main>
