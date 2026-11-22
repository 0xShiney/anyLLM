<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { rp, num, ms, pct, dateOnly } from '$lib/format';
	let { data, form } = $props();

	const result = $derived(form?.result ?? null);
	const loggingOn = $derived(data.projects.some((p) => p.logging_enabled && !p.zdr));
	const tagInfo = $derived(data.tags.find((t) => t.tag === data.tag));
	const activeRule = $derived(data.rules.find((r) => r.tag === data.tag));
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:20px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Replay Lab</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px;max-width:62ch">
			Jalankan ulang request yang sudah tercatat pada model kandidat, lalu bandingkan biaya, latency, dan kualitas sebelum
			Anda memindahkan trafik.
		</p>
	</div>
</header>

{#if !loggingOn}
	<div class="card card-pad" style="border-color:#e3cf9f;background:var(--warn-soft);margin-bottom:16px">
		<div style="font-size:13px;font-weight:500">Logging prompt belum aktif</div>
		<p style="font-size:13px;color:var(--warn);margin-top:4px">
			Replay Lab butuh isi prompt dan respons. Aktifkan logging per project di <a href="/dashboard/settings">Pengaturan</a>.
			Project dengan ZDR aktif tidak bisa memakai fitur ini.
		</p>
	</div>
{/if}
{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:16px;font-size:13px;color:var(--danger)">
		{form.error}
	</div>
{/if}
{#if form?.applied}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:16px;font-size:13px">
		Aturan aktif: tag <strong>{form.applied.tag}</strong> → <span class="num">{form.applied.target}</span> (versi {form.applied.version}).
		Versi sebelumnya diarsipkan dan bisa dikembalikan dari halaman Routing Rules.
	</div>
{/if}

<div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start">
	<div class="card card-pad">
		<div style="display:flex;justify-content:space-between;align-items:start;gap:16px">
			<div>
				<div class="label">Estimator tanpa memanggil provider</div>
				<div style="font-size:15px;margin-top:6px">
					Tag <span class="num">{data.tag || '—'}</span>
					{#if tagInfo}<span style="color:var(--ink-faint);font-size:13px"> · {num(tagInfo.requests)} request / 30 hari</span>{/if}
				</div>
			</div>
			<form method="GET" style="display:flex;gap:6px">
				<select class="select" name="tag" style="width:auto;min-width:130px">
					{#each data.tags as t}
						<option value={t.tag} selected={t.tag === data.tag}>{t.tag}</option>
					{/each}
				</select>
				<button class="btn btn-sm" type="submit">Pilih</button>
			</form>
		</div>

		{#if data.estimate && data.estimate.requests > 0}
			<table class="table" style="margin-top:14px">
				<thead>
					<tr><th>Model</th><th class="r">Biaya / bulan</th><th class="r">Hemat</th></tr>
				</thead>
				<tbody>
					<tr style="background:var(--surface-sunken)">
						<td><span style="font-size:13px">Saat ini</span><div class="num" style="font-size:11px;color:var(--ink-faint)">{data.estimate.currentModels.map((c) => c.model).join(', ')}</div></td>
						<td class="r num">{rp(data.estimate.currentCostMicros)}</td>
						<td class="r num" style="color:var(--ink-faint)">—</td>
					</tr>
					{#each data.estimate.candidates.slice(0, 5) as c}
						<tr>
							<td class="num" style="font-size:12px">{c.model}</td>
							<td class="r num">{rp(c.monthlyCostMicros)}</td>
							<td class="r num" style="color:{c.savingMicros > 0 ? 'var(--accent)' : 'var(--ink-faint)'}">
								{c.savingMicros > 0 ? `${pct(c.savingPct)} (${rp(c.savingMicros, { compact: true })})` : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="hint" style="margin-top:10px">
				Estimasi memakai token historis × harga katalog saat ini. Tidak ada request yang dikirim ke provider.
			</p>
		{:else}
			<div style="margin-top:14px">
				<State title="Belum ada log untuk tag ini" body="Aktifkan logging dan kirim header X-Tag pada request Anda." icon="tag" />
			</div>
		{/if}
	</div>

	<form method="POST" action="?/run" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:13px">
		<div>
			<div style="font-size:14px;font-weight:500">Jalankan replay</div>
			<div class="hint">Biaya dibatasi keras; sampel dihentikan jika budget habis.</div>
		</div>
		<input type="hidden" name="tag" value={data.tag} />
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
			<div class="field">
				<label class="label" for="sample">Sampel</label>
				<input class="input num" id="sample" name="sample" type="number" min="1" max="50" value="50" />
			</div>
			<div class="field">
				<label class="label" for="budget">Budget (Rp)</label>
				<input class="input num" id="budget" name="budget" type="number" min="1" value={data.budgetDefault} />
			</div>
		</div>
		<div class="field">
			<span class="label">Model kandidat (maks 3)</span>
			<div style="display:flex;flex-direction:column;gap:6px;max-height:150px;overflow-y:auto;padding:2px 0">
				{#each data.models.filter((m) => !data.estimate?.currentModels.some((c) => c.model === m.id)) as m}
					<label style="display:flex;align-items:center;gap:8px;font-size:12px">
						<input type="checkbox" name="candidates" value={m.id} checked={m.id === 'google/gemini-2.5-flash'} style="accent-color:var(--accent)" />
						<span class="num">{m.id}</span>
					</label>
				{/each}
			</div>
		</div>
		<button class="btn btn-primary" type="submit" disabled={!loggingOn}>Jalankan replay</button>
		<p class="hint">Dengan mode mock, hasil ditandai simulasi. Hasil asli memakai kunci provider Anda di server.</p>
	</form>
</div>

{#if result}
	<div class="card" style="margin-top:16px;overflow:hidden">
		<div class="card-head">
			<div>
				<div style="font-size:15px;font-weight:500">
					Hemat {rp(result.summary.monthlySavingMicros, { compact: true })}/bulan
					{#if result.summary.qualityDelta < -0.02}
						<span style="color:var(--danger)">· kualitas turun {pct(Math.abs(result.summary.qualityDelta) * 100, 0)}</span>
					{:else if result.summary.qualityDelta > 0.02}
						<span style="color:var(--accent)">· kualitas naik {pct(result.summary.qualityDelta * 100, 0)}</span>
					{:else}
						<span style="color:var(--ink-soft)">· kualitas setara</span>
					{/if}
				</div>
				<div class="hint">
					{result.sampleSize} sampel · budget {rp(result.budgetMicros)} · terpakai {rp(result.spentMicros)}
					{#if result.simulated}· simulasi (mock){/if}
				</div>
			</div>
			<div style="display:flex;gap:6px;align-items:center">
				{#if result.summary.lowSample}<span class="badge badge-warn">sampel kecil</span>{/if}
				<span class="badge">{pct(result.summary.savingPct)} lebih murah</span>
			</div>
		</div>
		<table class="table">
			<thead>
				<tr><th>Model</th><th class="r">Biaya / req</th><th class="r">Latency</th><th class="r">Token keluar</th><th class="r">Cek otomatis</th><th class="r">Menang</th><th class="r">Batas bawah 95%</th></tr>
			</thead>
			<tbody>
				<tr style="background:var(--surface-sunken)">
					<td><div style="font-size:13px">Baseline</div><div class="num" style="font-size:11px;color:var(--ink-faint)">{result.baseline.model}</div></td>
					<td class="r num">{rp(result.baseline.avgCostMicros)}</td>
					<td class="r num">{ms(result.baseline.avgLatencyMs)}</td>
					<td class="r num">—</td>
					<td class="r num">—</td>
					<td class="r num">50%</td>
					<td class="r num">—</td>
				</tr>
				{#each result.candidates as c}
					<tr>
						<td class="num" style="font-size:12px">{c.model}</td>
						<td class="r num">{rp(c.avgCostMicros)}</td>
						<td class="r num">{ms(c.avgLatencyMs)}</td>
						<td class="r num">{num(c.avgOutputTokens)}</td>
						<td class="r num">{pct(c.autoPass * 100, 0)}</td>
						<td class="r num" style="color:{c.winRate >= 0.5 ? 'var(--accent)' : 'var(--ink)'}">{pct(c.winRate * 100, 0)}</td>
						<td class="r num" style="color:var(--ink-faint)">{pct(c.winRateLower * 100, 0)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if result?.summary?.recommended}
	<div class="card card-pad" style="margin-top:16px">
		<div style="display:flex;justify-content:space-between;gap:24px;align-items:end;flex-wrap:wrap">
			<div style="max-width:56ch">
				<div style="font-size:14px;font-weight:500">Terapkan sebagai aturan routing</div>
				<p class="hint" style="margin-top:4px">
					Semua request dengan tag <span class="num">{result.tag}</span> akan memakai
					<span class="num">{result.summary.recommended}</span>, dengan fallback ke model asli bila gagal. Aturan punya
					versi baru dan bisa dikembalikan.
				</p>
			</div>
			<form method="POST" action="?/apply" use:enhance style="display:flex;gap:8px;align-items:end">
				<input type="hidden" name="tag" value={result.tag} />
				<input type="hidden" name="target" value={result.summary.recommended} />
				<input type="hidden" name="fallback" value={result.baseline.model} />
				<input type="hidden" name="note" value={`Replay ${result.sampleSize} sampel: hemat ${result.summary.savingPct.toFixed(1)}%`} />
				<button class="btn btn-primary" type="submit">Aktifkan aturan</button>
			</form>
		</div>
		{#if activeRule}
			<p class="hint" style="margin-top:10px">
				Aturan aktif saat ini untuk tag ini: <span class="num">{activeRule.target_model}</span> (v{activeRule.version}). Mengaktifkan
				yang baru akan mengarsipkan versi ini.
			</p>
		{/if}
	</div>
{/if}

{#if result?.pairs?.length}
	<div class="card" style="margin-top:16px;overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Perbandingan output</div><span class="badge">3 contoh</span></div>
		{#each result.pairs.slice(0, 3) as p}
			<div style="border-bottom:1px solid var(--line)">
				<div style="padding:10px 16px;background:var(--surface-sunken);font-size:12px;color:var(--ink-soft)">
					<div class="label">Prompt</div>
					<div style="margin-top:2px">{p.prompt}</div>
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)">
					<div style="background:var(--surface);padding:12px 16px">
						<div class="label" style="margin-bottom:6px">Asli · {p.originalModel}</div>
						<pre class="num" style="font-size:11px;white-space:pre-wrap;margin:0;color:var(--ink-soft);line-height:1.65">{p.original}</pre>
					</div>
					<div style="background:var(--surface);padding:12px 16px">
						<div class="label" style="margin-bottom:6px">Kandidat · {p.candidateModel}</div>
						<pre class="num" style="font-size:11px;white-space:pre-wrap;margin:0;color:var(--ink-soft);line-height:1.65">{p.candidate}</pre>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<div class="card" style="margin-top:16px;overflow:hidden">
	<div class="card-head"><div style="font-size:14px;font-weight:500">Riwayat replay</div></div>
	{#if data.runs.length}
		<table class="table">
			<thead><tr><th>Tanggal</th><th>Tag</th><th class="r">Hemat / bulan</th><th class="r">Kualitas</th><th class="r">Biaya replay</th><th class="r">Status</th></tr></thead>
			<tbody>
				{#each data.runs as r}
					<tr>
						<td class="num" style="font-size:12px;color:var(--ink-soft)">{dateOnly(r.created_at)}</td>
						<td>{r.tag}</td>
						<td class="r num">{r.summary ? rp(r.summary.monthlySavingMicros, { compact: true }) : '—'}</td>
						<td class="r num">{r.summary ? pct(r.summary.savingPct) : '—'}</td>
						<td class="r num">{rp(r.spent_micros)}</td>
						<td class="r"><span class="badge" class:badge-ok={r.status === 'done'}>{r.status}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div style="padding:20px"><State title="Belum ada replay" body="Jalankan replay pertama pada satu tag untuk melihat peluang penghematan." icon="replay" /></div>
	{/if}
</div>
