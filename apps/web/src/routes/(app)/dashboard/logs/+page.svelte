<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { rp, num, ms, dateTime, tokens } from '$lib/format';
	let { data, form } = $props();
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / 40)));
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:18px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Logs</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">{num(data.total)} request tercatat. Klik waktu untuk detail.</p>
	</div>
	<a class="btn btn-sm" href="/dashboard/logs/export">Ekspor CSV</a>
</header>

<form method="GET" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
	<select class="select" name="tag" style="width:auto;min-width:140px">
		<option value="">Semua tag</option>
		{#each data.tags as t}<option value={t.tag} selected={data.filters.tag === t.tag}>{t.tag}</option>{/each}
	</select>
	<select class="select" name="model" style="width:auto;min-width:200px">
		<option value="">Semua model</option>
		{#each data.models as m}<option value={m.model} selected={data.filters.model === m.model}>{m.model}</option>{/each}
	</select>
	<select class="select" name="status" style="width:auto;min-width:140px">
		<option value="">Semua status</option>
		{#each ['ok', 'provider_error', 'rate_limited', 'client_aborted'] as s}
			<option value={s} selected={data.filters.status === s}>{s}</option>
		{/each}
	</select>
	<button class="btn" type="submit">Terapkan</button>
	<a class="btn btn-ghost" href="/dashboard/logs">Reset</a>
</form>

{#if form?.reported}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">
		Tiket dibuat. Support akan melihat konteks request ini.
	</div>
{/if}

{#if data.selected}
	{@const s = data.selected}
	<div class="card" style="margin-bottom:14px">
		<div class="card-head">
			<div>
				<div style="font-size:14px;font-weight:500">Detail request</div>
				<div class="num" style="font-size:12px;color:var(--ink-faint)">{s.request_id}</div>
			</div>
			<a class="btn btn-sm btn-ghost" href="/dashboard/logs">Tutup</a>
		</div>
		<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line)">
			{#each [
				{ l: 'Waktu', v: dateTime(String(s.created_at)) },
				{ l: 'Model', v: String(s.model) },
				{ l: 'Provider', v: String(s.provider) },
				{ l: 'Status', v: String(s.status) },
				{ l: 'Token prompt', v: num(Number(s.prompt_tokens)) },
				{ l: 'Token completion', v: num(Number(s.completion_tokens)) },
				{ l: 'Biaya modal', v: rp(Number(s.cost_micros)) },
				{ l: 'Ditagihkan', v: rp(Number(s.billed_micros)) },
				{ l: 'Latency', v: ms(Number(s.latency_ms)) },
				{ l: 'Tag', v: s.tag ? String(s.tag) : '—' },
				{ l: 'Stream', v: s.stream ? 'ya' : 'tidak' },
				{ l: 'Sumber', v: s.simulated ? 'simulasi (mock)' : 'provider' }
			] as item}
				<div style="background:var(--surface);padding:10px 14px">
					<div class="label">{item.l}</div>
					<div class="num" style="font-size:12px;margin-top:3px">{item.v}</div>
				</div>
			{/each}
		</div>
		{#if data.prompt}
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border-top:1px solid var(--line)">
				<div style="background:var(--surface);padding:12px 14px">
					<div class="label" style="margin-bottom:6px">Prompt (opt-in)</div>
					<pre class="num" style="font-size:12px;white-space:pre-wrap;margin:0;color:var(--ink-soft)">{data.prompt.prompt}</pre>
				</div>
				<div style="background:var(--surface);padding:12px 14px">
					<div class="label" style="margin-bottom:6px">Respons</div>
					<pre class="num" style="font-size:12px;white-space:pre-wrap;margin:0;color:var(--ink-soft)">{data.prompt.response}</pre>
				</div>
			</div>
		{:else}
			<div style="padding:12px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-faint)">
				Isi prompt tidak tersimpan untuk request ini. Logging opt-in mati atau retensi sudah lewat.
			</div>
		{/if}
		<form method="POST" action="?/report" use:enhance style="padding:14px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:end">
			<input type="hidden" name="request_id" value={s.request_id} />
			<div class="field" style="flex:1">
				<label class="label" for="body">Laporkan masalah request ini</label>
				<input class="input" id="body" name="body" placeholder="Contoh: biaya terpotong padahal provider error" />
			</div>
			<button class="btn" type="submit">Kirim ke support</button>
		</form>
		{#if form?.error}<p class="err" style="padding:0 14px 12px">{form.error}</p>{/if}
	</div>
{/if}

<div class="card" style="overflow:hidden">
	{#if data.rows.length}
		<table class="table">
			<thead>
				<tr><th>Waktu</th><th>Model</th><th>Tag</th><th>Key</th><th class="r">Token</th><th class="r">Ditagih</th><th class="r">Latency</th><th class="r">Status</th></tr>
			</thead>
			<tbody>
				{#each data.rows as row}
					<tr>
						<td class="num" style="font-size:12px">
							<a href="?request={row.request_id}" style="text-decoration:none;color:var(--ink-soft)">{dateTime(String(row.created_at))}</a>
							{#if row.stream}<span class="badge" style="margin-left:6px;font-size:9px">sse</span>{/if}
						</td>
						<td class="num" style="font-size:12px">{row.model}</td>
						<td style="font-size:12px">{row.tag ?? '—'}</td>
						<td style="font-size:12px;color:var(--ink-soft)">{row.key_name ?? '—'}</td>
						<td class="r num">{tokens(Number(row.prompt_tokens) + Number(row.completion_tokens))}</td>
						<td class="r num">{rp(Number(row.billed_micros))}</td>
						<td class="r num">{ms(Number(row.latency_ms))}</td>
						<td class="r">
							{#if row.status === 'ok'}
								<span class="badge badge-ok">ok</span>
							{:else}
								<span class="badge badge-danger">{row.status}</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-faint)">
			<span>Halaman {data.page} dari {totalPages}</span>
			<span style="display:flex;gap:6px">
				{#if data.page > 1}
					<a class="btn btn-sm" href="?page={data.page - 1}{data.filters.tag ? `&tag=${data.filters.tag}` : ''}{data.filters.model ? `&model=${data.filters.model}` : ''}">Sebelumnya</a>
				{/if}
				{#if data.page < totalPages}
					<a class="btn btn-sm" href="?page={data.page + 1}{data.filters.tag ? `&tag=${data.filters.tag}` : ''}{data.filters.model ? `&model=${data.filters.model}` : ''}">Berikutnya</a>
				{/if}
			</span>
		</div>
	{:else}
		<div style="padding:20px">
			<State
				title="Tidak ada request pada filter ini"
				body="Kirim request ke gateway dengan header X-Tag agar log lebih mudah dikelompokkan."
				icon="list"
				actionLabel="Lihat dokumentasi"
				actionHref="/docs"
			/>
		</div>
	{/if}
</div>
