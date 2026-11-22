<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { rp } from '$lib/format';
	let { data } = $props();
</script>

<PublicNav />

<main>
	<section class="wrap" style="padding-top:64px;padding-bottom:56px">
		<div style="display:grid;grid-template-columns:1.15fr 1fr;gap:56px;align-items:end">
			<div>
				<div class="label" style="margin-bottom:18px">Gateway LLM terpadu · Indonesia</div>
				<h1 style="font-size:56px;line-height:1.04;max-width:15ch">
					Satu endpoint.<br />Semua model.<br /><span style="color:var(--accent)">Satu tagihan.</span>
				</h1>
				<p style="margin-top:20px;font-size:16px;color:var(--ink-soft);max-width:52ch">
					Ganti base URL SDK OpenAI Anda, lalu akses model dari beberapa provider dengan saldo prabayar dalam rupiah.
					Biaya per request terlihat, dan setiap tag bisa dipindahkan ke model yang lebih hemat setelah diuji.
				</p>
				<div style="display:flex;gap:10px;margin-top:26px">
					<a class="btn btn-primary" href="/signup">Buat kunci pertama</a>
					<a class="btn" href="/docs">Lihat dokumentasi</a>
				</div>
				<div style="display:flex;gap:22px;margin-top:30px;font-size:12px;color:var(--ink-faint)">
					<span>Kompatibel OpenAI SDK</span>
					<span>Saldo dalam IDR</span>
					<span>Logging opt-in</span>
				</div>
			</div>
			<div class="card" style="padding:0;overflow:hidden">
				<div
					style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--surface-sunken)"
				>
					<span class="label">Request pertama</span>
					<span class="badge">curl</span>
				</div>
				<pre
					class="num"
					style="margin:0;padding:16px;font-size:12px;line-height:1.7;overflow-x:auto;color:var(--ink-soft)"><span
						style="color:var(--ink-faint)">POST</span> https://api.anyllm.id/v1/chat/completions
<span style="color:var(--ink-faint)">Authorization:</span> Bearer sk-any-...

&#123;
  "model": "auto-murah",
  "messages": [
    &#123; "role": "user", "content": "Ringkas rapat ini." &#125;
  ],
  "stream": true
&#125;</pre
				>
				<div style="border-top:1px solid var(--line);padding:12px 14px;display:flex;justify-content:space-between;font-size:12px">
					<span style="color:var(--ink-faint)">Biaya tercatat per request</span>
					<span class="num" style="color:var(--accent)">{rp(data.exampleCost)}</span>
				</div>
			</div>
		</div>
	</section>

	<section class="wrap" style="border-top:1px solid var(--line);padding-top:56px;padding-bottom:56px">
		<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line)">
			{#each data.stats as s}
				<div style="background:var(--surface);padding:20px">
					<div class="num" style="font-size:24px;margin-bottom:4px">{s.value}</div>
					<div style="font-size:12px;color:var(--ink-soft)">{s.label}</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="wrap" style="padding-top:56px;padding-bottom:56px;border-top:1px solid var(--line)">
		<div style="display:grid;grid-template-columns:0.9fr 1.1fr;gap:56px">
			<div>
				<div class="label" style="margin-bottom:14px">Replay Lab</div>
				<h2 style="font-size:34px;line-height:1.12;max-width:18ch">
					Model termurah bukan berarti model yang tepat.
				</h2>
				<p style="margin-top:16px;color:var(--ink-soft);max-width:46ch">
					Gateway lain menampilkan biaya. Replay Lab menjalankan ulang request Anda yang sudah tercatat pada model kandidat,
					lalu mengukur biaya, latency, dan kualitasnya sebelum Anda memutuskan.
				</p>
				<a href="/docs#replay" class="btn btn-sm" style="margin-top:20px">Cara kerjanya</a>
			</div>
			<div class="card" style="overflow-x:auto">
				<div class="card-head">
					<div>
						<div style="font-size:13px;font-weight:500">Tag: ringkasan</div>
						<div style="font-size:12px;color:var(--ink-faint)">50 sampel dari 30 hari terakhir</div>
					</div>
					<span class="badge badge-ok">Hemat 79%</span>
				</div>
				<table class="table">
					<thead>
						<tr><th>Model</th><th class="r">Biaya / request</th><th class="r">Latency</th><th class="r">Menang</th></tr>
					</thead>
					<tbody>
						{#each data.replayTeaser as r}
							<tr>
								<td class="num" style="font-size:12px">{r.model}</td>
								<td class="r num">{rp(r.cost)}</td>
								<td class="r num">{r.latency} ms</td>
								<td class="r num">{Math.round(r.win * 100)}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div style="padding:12px 20px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-faint)">
					Angka contoh dari workspace demo. Penilai kualitas memakai rubrik yang Anda tulis.
				</div>
			</div>
		</div>
	</section>

	<section class="wrap" style="padding-top:56px;padding-bottom:56px;border-top:1px solid var(--line)">
		<div class="label" style="margin-bottom:22px">Yang Anda dapat</div>
		<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
			{#each data.features as f}
				<div class="card card-pad">
					<div style="color:var(--accent);margin-bottom:12px"><Icon name={f.icon} size={16} /></div>
					<div style="font-size:14px;font-weight:500;margin-bottom:6px">{f.title}</div>
					<p style="font-size:13px;color:var(--ink-soft)">{f.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="wrap" style="padding-top:56px;padding-bottom:56px;border-top:1px solid var(--line)">
		<div style="display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:20px">
			<div>
				<div class="label" style="margin-bottom:12px">Harga</div>
				<h2 style="font-size:28px">Markup per model. Tanpa langganan.</h2>
			</div>
			<a href="/pricing" style="font-size:13px">Semua harga & kalkulator →</a>
		</div>
		<div class="card" style="overflow-x:auto">
			<table class="table">
				<thead>
					<tr><th>Model</th><th class="r">Input / 1 jt token</th><th class="r">Output / 1 jt token</th><th class="r">Konteks</th></tr>
				</thead>
				<tbody>
					{#each data.models as m}
						<tr>
							<td>
								<div style="font-size:13px">{m.label}</div>
								<div class="num" style="font-size:11px;color:var(--ink-faint)">{m.id}</div>
							</td>
							<td class="r num">{rp(m.sellInput)}</td>
							<td class="r num">{rp(m.sellOutput)}</td>
							<td class="r num" style="color:var(--ink-soft)">{(m.context / 1000).toLocaleString('id-ID')} rb</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<footer style="border-top:1px solid var(--line);margin-top:32px">
		<div class="wrap" style="padding:32px 0;display:flex;justify-content:space-between;gap:24px;font-size:12px;color:var(--ink-faint)">
			<div>
				<div style="font-family:var(--font-display);font-size:16px;color:var(--ink);margin-bottom:6px">anyLLM</div>
				Gateway LLM terpadu. Data pelanggan disimpan di Postgres milik sendiri.
			</div>
			<div style="display:flex;gap:40px">
				<div style="display:flex;flex-direction:column;gap:6px">
					<a href="/docs" style="text-decoration:none;color:var(--ink-soft)">Dokumentasi</a>
					<a href="/pricing" style="text-decoration:none;color:var(--ink-soft)">Harga</a>
					<a href="/status" style="text-decoration:none;color:var(--ink-soft)">Status</a>
				</div>
				<div style="display:flex;flex-direction:column;gap:6px">
					<span>Syarat Layanan</span>
					<span>Kebijakan Privasi</span>
					<span>Acceptable Use</span>
				</div>
			</div>
		</div>
	</footer>
</main>

<style>
	.wrap {
		max-width: 1120px;
		margin: 0 auto;
		padding-left: 32px;
		padding-right: 32px;
	}
	@media (max-width: 900px) {
		.wrap {
			padding-left: 20px;
			padding-right: 20px;
		}
		section :global(div[style*='grid-template-columns']) {
			grid-template-columns: 1fr !important;
		}
		h1 {
			font-size: 40px !important;
		}
	}
</style>
