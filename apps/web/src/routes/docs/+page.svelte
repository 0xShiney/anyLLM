<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	let { data } = $props();
	const first = $derived(data.models[0]?.id ?? 'openai/gpt-4o-mini');

	const sections = [
		{ id: 'mulai', label: 'Mulai cepat' },
		{ id: 'streaming', label: 'Streaming' },
		{ id: 'tag', label: 'Tag dan metering' },
		{ id: 'routing', label: 'Routing dan fallback' },
		{ id: 'replay', label: 'Replay Lab' },
		{ id: 'error', label: 'Error dan retry' }
	];
</script>

<PublicNav />
<main style="max-width:1120px;margin:0 auto;padding:40px 32px 72px;display:grid;grid-template-columns:180px 1fr;gap:48px">
	<nav style="position:sticky;top:24px;align-self:start;display:flex;flex-direction:column;gap:8px">
		<div class="label" style="margin-bottom:4px">Dokumentasi</div>
		{#each sections as s}
			<a href="#{s.id}" style="font-size:13px;text-decoration:none;color:var(--ink-soft)">{s.label}</a>
		{/each}
	</nav>

	<div style="max-width:720px">
		<h1 style="font-size:36px;line-height:1.15">API referensi singkat</h1>
		<p style="margin-top:12px;color:var(--ink-soft)">
			Gateway ini kompatibel dengan OpenAI Chat Completions. Ganti base URL dan kunci, kode lain tetap.
		</p>

		<section id="mulai" style="margin-top:40px">
			<h2 style="font-size:22px;margin-bottom:10px">Mulai cepat</h2>
			<p style="color:var(--ink-soft);font-size:13px;margin-bottom:12px">
				Base URL: <span class="num" style="color:var(--ink)">https://api.anyllm.id/v1</span>. Model tersedia:
				{#each data.models as m, i}<span class="num" style="font-size:12px">{m.id}{i < data.models.length - 1 ? ', ' : ''}</span>{/each}
			</p>
			<pre class="code">curl https://api.anyllm.id/v1/chat/completions \
  -H "Authorization: Bearer $ANYLLM_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Tag: ringkasan" \
  -H "Idempotency-Key: ringkas-2026-11-22-001" \
  -d '&#123;
    "model": "{first}",
    "messages": [&#123;"role": "user", "content": "Ringkas rapat ini."&#125;],
    "max_tokens": 400
  &#125;'</pre>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
				<pre class="code">from openai import OpenAI

client = OpenAI(
    base_url="https://api.anyllm.id/v1",
    api_key="sk-any-..."
)

r = client.chat.completions.create(
    model="{first}",
    messages=[&#123;"role": "user", "content": "Halo"&#125;],
)
print(r.usage)</pre>
				<pre class="code">import OpenAI from "openai";

const client = new OpenAI(&#123;
  baseURL: "https://api.anyllm.id/v1",
  apiKey: process.env.ANYLLM_API_KEY,
&#125;);

const r = await client.chat.completions.create(&#123;
  model: "{first}",
  messages: [&#123; role: "user", content: "Halo" &#125;],
&#125;);</pre>
			</div>
			<pre class="code" style="margin-top:12px">client, err := openai.NewClient(
    option.WithBaseURL("https://api.anyllm.id/v1"),
    option.WithAPIKey(os.Getenv("ANYLLM_API_KEY")),
)</pre>
		</section>

		<section id="streaming" style="margin-top:36px">
			<h2 style="font-size:22px;margin-bottom:10px">Streaming</h2>
			<p style="color:var(--ink-soft);font-size:13px;margin-bottom:12px">
				Kirim <span class="num">"stream": true</span> untuk SSE. Chunk terakhir membawa usage. Jika klien memutus stream,
				token yang sudah terkirim tetap ditagih dan log ditandai terputus.
			</p>
			<pre class="code">data: &#123;"choices":[&#123;"delta":&#123;"content":"Ringkasan"&#125;&#125;]&#125;

data: &#123;"choices":[&#123;"delta":&#123;&#125;,"finish_reason":"stop"&#125;],
      "usage":&#123;"prompt_tokens":812,"completion_tokens":204&#125;&#125;

data: [DONE]</pre>
		</section>

		<section id="tag" style="margin-top:36px">
			<h2 style="font-size:22px;margin-bottom:10px">Tag dan metering</h2>
			<p style="color:var(--ink-soft);font-size:13px">
				Header <span class="num">X-Tag</span> mengelompokkan request untuk estimator dan aturan routing. Nilai yang
				disarankan: <span class="num">ringkasan</span>, <span class="num">klasifikasi</span>,
				<span class="num">chat-support</span>, <span class="num">ekstraksi</span>. Setiap respons membawa
				<span class="num">X-Request-Id</span> dan <span class="num">X-Anyllm-Cost-Micros</span>.
			</p>
		</section>

		<section id="routing" style="margin-top:36px">
			<h2 style="font-size:22px;margin-bottom:10px">Routing dan fallback</h2>
			<table class="table" style="background:var(--surface);border:1px solid var(--line)">
				<thead><tr><th>Nilai</th><th>Perilaku</th></tr></thead>
				<tbody>
					<tr><td class="num">auto-murah</td><td>Model termurah yang aktif, lalu fallback ke dua model berikutnya.</td></tr>
					<tr><td class="num">auto-cepat</td><td>Latency rata-rata terendah 7 hari terakhir.</td></tr>
					<tr><td class="num">@preset/{data.presets[0]?.slug ?? 'nama'}</td><td>Daftar model tersimpan, parameter, dan system prompt.</td></tr>
					<tr><td class="num">provider/model</td><td>Model eksplisit. Fallback tetap aktif kecuali dimatikan.</td></tr>
				</tbody>
			</table>
			<pre class="code" style="margin-top:12px">&#123;
  "model": "auto-murah",
  "models": ["google/gemini-2.5-flash", "openai/gpt-4o-mini"],
  "provider": &#123;
    "sort": "price",
    "max_price": 50000,
    "allow_fallbacks": true,
    "ignore": ["generic"],
    "data_collection": "deny"
  &#125;
&#125;</pre>
		</section>

		<section id="replay" style="margin-top:36px">
			<h2 style="font-size:22px;margin-bottom:10px">Replay Lab</h2>
			<ol style="padding-left:18px;font-size:13px;color:var(--ink-soft);line-height:2">
				<li>Aktifkan logging per project di Pengaturan. Prompt dan respons disimpan terenkripsi, retensi 7/30/90 hari.</li>
				<li>Kirim header <span class="num">X-Tag</span> agar request bisa dikelompokkan.</li>
				<li>Buka Replay Lab, pilih tag, lihat estimasi hemat tanpa memanggil provider.</li>
				<li>Pilih 1–3 model kandidat dan jumlah sampel. Biaya replay dibatasi keras oleh budget.</li>
				<li>Terapkan hasil sebagai aturan routing per tag; aturan punya versi dan bisa di-rollback.</li>
			</ol>
		</section>

		<section id="error" style="margin-top:36px">
			<h2 style="font-size:22px;margin-bottom:10px">Error dan retry</h2>
			<pre class="code">&#123;
  "error": &#123;
    "type": "insufficient_quota",
    "message": "Saldo tidak cukup untuk request ini.",
    "request_id": "req_8f21c0"
  &#125;
&#125;</pre>
			<p style="color:var(--ink-soft);font-size:13px;margin-top:10px">
				Status 429 menyertakan <span class="num">Retry-After</span>. Endpoint tulis menerima
				<span class="num">Idempotency-Key</span> (disimpan 24 jam per API key): permintaan ulang dengan key dan body yang
			sama dibalas dari respons tersimpan tanpa tagihan kedua, key yang sama dengan body berbeda ditolak 409. Fallback hanya
			menagih percobaan yang benar-benar menghasilkan output.
			</p>
		</section>
	</div>
</main>

<style>
	.code {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 14px;
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1.65;
		overflow-x: auto;
		color: var(--ink-soft);
		margin: 0;
	}
</style>
