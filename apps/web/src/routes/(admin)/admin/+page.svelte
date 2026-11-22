<script lang="ts">
	import Metric from '$lib/components/Metric.svelte';
	import { rp, num, ms, pct, dateTime, dateOnly } from '$lib/format';
	let { data } = $props();
	const margin = $derived(data.metrics.revenue ? ((data.metrics.revenue - data.metrics.cost) / data.metrics.revenue) * 100 : 0);
	const errorRate = $derived(data.metrics.requests ? (data.metrics.errors / data.metrics.requests) * 100 : 0);
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:20px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Ops</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">24 jam terakhir · {data.user.role} · semua angka lintas customer</p>
	</div>
	<span class="badge">read-only untuk support</span>
</header>

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
	<Metric label="Request 24 jam" value={num(data.metrics.requests)} hint="seluruh platform" />
	<Metric label="Pendapatan" value={rp(data.metrics.revenue)} hint={`modal ${rp(data.metrics.cost)}`} />
	<Metric label="Margin" value={pct(margin)} hint="harga jual − biaya modal" accent />
	<Metric label="Error rate" value={pct(errorRate, 2)} hint={`${num(data.metrics.errors)} gagal`} />
</div>

<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-top:14px">
	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Kesehatan provider</div><span class="badge">24 jam</span></div>
		<table class="table">
			<thead><tr><th>Provider</th><th class="r">Request</th><th class="r">Sukses</th><th class="r">Latency</th><th class="r">Status</th></tr></thead>
			<tbody>
				{#each data.metrics.perProvider as p}
					<tr>
						<td style="text-transform:capitalize;font-size:13px">{p.provider}</td>
						<td class="r num">{num(p.requests)}</td>
						<td class="r num">{pct(p.success * 100, 2)}</td>
						<td class="r num">{ms(p.latency)}</td>
						<td class="r">
							{#if p.success >= 0.99}<span class="badge badge-ok">normal</span>
							{:else if p.success >= 0.95}<span class="badge badge-warn">degradasi</span>
							{:else}<span class="badge badge-danger">gangguan</span>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Kunci platform</div></div>
		{#each data.providerKeys as k}
			<div style="padding:11px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:center">
				<div>
					<div style="font-size:13px;text-transform:capitalize">{k.provider} · {k.label}</div>
					<div class="hint" style="font-size:11px">{k.balance_note} · diverifikasi {k.verified_at ? dateOnly(String(k.verified_at)) : 'belum'}</div>
				</div>
				<span class="badge" class:badge-warn={k.status !== 'active'}>{k.status}</span>
			</div>
		{/each}
	</div>
</div>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px">
	<div class="card card-pad">
		<div class="label">Antrean replay</div>
		{#each data.replayQueue as q}
			<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:8px">
				<span>{q.status}</span><span class="num">{q.n}</span>
			</div>
		{/each}
		<p class="hint" style="margin-top:8px">Replay berjalan di proses yang sama; batas konkurensi 4.</p>
	</div>
	<div class="card card-pad">
		<div class="label">Customer teratas 7 hari</div>
		{#each data.flagged as f}
			<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:8px">
				<a href="/admin/customers?id={f.id}" style="color:var(--ink);text-decoration:none">{f.name}</a>
				<span class="num">{rp(f.spend, { compact: true })}</span>
			</div>
		{/each}
	</div>
	<div class="card card-pad">
		<div class="label">Aksi admin terakhir</div>
		{#each data.recentAudit.slice(0, 4) as a}
			<div style="margin-top:8px">
				<div class="num" style="font-size:11px">{a.action} · {a.target}</div>
				<div class="hint" style="font-size:11px">{a.actor_email} · {dateTime(String(a.created_at))}</div>
			</div>
		{/each}
	</div>
</div>

<div class="card" style="margin-top:14px;overflow:hidden">
	<div class="card-head"><div style="font-size:14px;font-weight:500">Customer</div><a href="/admin/customers" style="font-size:12px">Semua →</a></div>
	<table class="table">
		<thead><tr><th>Workspace</th><th>Owner</th><th class="r">Saldo</th><th class="r">Biaya 30 h</th><th class="r">Kunci</th></tr></thead>
		<tbody>
			{#each data.customers as c}
				<tr>
					<td><a href="/admin/customers?id={c.id}" style="color:var(--ink);text-decoration:none;font-size:13px">{c.name}</a></td>
					<td style="font-size:12px;color:var(--ink-soft)">{c.owner_email ?? '—'}</td>
					<td class="r num">{rp(Number(c.balance_micros))}</td>
					<td class="r num">{rp(Number(c.spend_30d))}</td>
					<td class="r num">{c.keys}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
