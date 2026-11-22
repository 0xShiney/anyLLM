<script lang="ts">
	import Metric from '$lib/components/Metric.svelte';
	import LineChart from '$lib/components/LineChart.svelte';
	import BarList from '$lib/components/BarList.svelte';
	import State from '$lib/components/State.svelte';
	import { rp, num, ms, tokens, relative, dateTime, pct } from '$lib/format';
	let { data } = $props();
	const errorRate = $derived(data.current.requests ? (data.current.errors / data.current.requests) * 100 : 0);
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:20px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Ringkasan</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">30 hari terakhir · diperbarui saat halaman dimuat</p>
	</div>
	<div style="display:flex;gap:8px">
		<a class="btn btn-sm" href="/dashboard/logs">Semua log</a>
		<a class="btn btn-sm btn-primary" href="/dashboard/replay">Buka Replay Lab</a>
	</div>
</header>

{#if data.simulated > 0}
	<div
		style="display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid #e3cf9f;background:var(--warn-soft);border-radius:3px;margin-bottom:20px;font-size:12px;color:var(--warn)"
	>
		<span class="badge badge-warn">Demo</span>
		<span>{num(data.simulated)} dari {num(data.current.requests)} request berasal dari data simulasi (mode mock tanpa kunci provider).</span>
	</div>
{/if}

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
	<Metric label="Biaya 30 hari" value={rp(data.current.spend)} delta={data.deltas.spend} hint="30 hari pertama" />
	<Metric label="Request" value={num(data.current.requests)} delta={data.deltas.requests} hint="30 hari pertama" />
	<Metric label="Latency p95" value={ms(data.current.p95Latency)} hint={`rata-rata ${ms(data.current.avgLatency)}`} />
	<Metric label="Error rate" value={pct(errorRate, 2)} hint={`${num(data.current.errors)} request gagal`} />
</div>

<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px;margin-top:14px">
	<div class="card card-pad">
		<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
			<div>
				<div style="font-size:14px;font-weight:500">Biaya harian</div>
				<div class="hint">Sudah termasuk markup; tidak termasuk saldo yang ditahan.</div>
			</div>
			<div class="num" style="font-size:13px;color:var(--ink-soft)">{rp(data.current.spend, { compact: true })}</div>
		</div>
		<LineChart points={data.series} format={(n) => rp(n, { compact: true })} height={150} />
	</div>
	<div class="card card-pad" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px">
		<div>
			<div class="label">Saldo tersedia</div>
			<div class="num" style="font-size:28px;margin-top:6px">{rp(data.balance)}</div>
			<div class="hint" style="margin-top:4px">Saldo ditahan untuk request berjalan tidak dihitung.</div>
		</div>
		<div style="display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--ink-soft)">
			<div style="display:flex;justify-content:space-between"><span>Aturan routing aktif</span><span class="num">{data.activeRules}</span></div>
			<div style="display:flex;justify-content:space-between"><span>Replay dijalankan</span><span class="num">{data.replayCount}</span></div>
			<div style="display:flex;justify-content:space-between"><span>Token 30 hari</span><span class="num">{tokens(data.current.tokens)}</span></div>
		</div>
		<a class="btn btn-sm" href="/dashboard/billing" style="width:100%">Top up saldo</a>
	</div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
	<div class="card card-pad">
		<div style="font-size:14px;font-weight:500;margin-bottom:14px">Biaya per model</div>
		<BarList
			rows={data.models.slice(0, 6).map((m) => ({ label: m.model, value: m.spend, sub: `${num(m.requests)} req` }))}
			format={(n) => rp(n)}
		/>
	</div>
	<div class="card card-pad">
		<div style="font-size:14px;font-weight:500;margin-bottom:14px">Biaya per tag</div>
		{#if data.tags.length}
			<BarList rows={data.tags.map((t) => ({ label: t.tag, value: t.spend, sub: `${num(t.requests)} req` }))} format={(n) => rp(n)} />
		{:else}
			<State title="Belum ada tag" body="Kirim header X-Tag pada request agar biaya bisa dikelompokkan per tugas." icon="tag" />
		{/if}
	</div>
</div>

<div class="card" style="margin-top:14px;overflow:hidden">
	<div class="card-head">
		<div style="font-size:14px;font-weight:500">Request terakhir</div>
		<a href="/dashboard/logs" style="font-size:12px">Lihat semua</a>
	</div>
	<table class="table">
		<thead>
			<tr><th>Waktu</th><th>Model</th><th>Tag</th><th class="r">Token</th><th class="r">Biaya</th><th class="r">Status</th></tr>
		</thead>
		<tbody>
			{#each data.recent as row}
				<tr>
					<td class="num" style="font-size:12px;color:var(--ink-soft)">{dateTime(String(row.created_at))}</td>
					<td class="num" style="font-size:12px">{row.model}</td>
					<td>{row.tag ? row.tag : '—'}</td>
					<td class="r num">{tokens(Number(row.prompt_tokens) + Number(row.completion_tokens))}</td>
					<td class="r num">{rp(Number(row.billed_micros))}</td>
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
</div>
