<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { rp, num, dateTime } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Ledger & Refund</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Ledger append-only. Refund menulis entri kredit baru, bukan mengubah entri lama.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.refunded}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Refund dicatat untuk {form.refunded}.</div>
{/if}

<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Kandidat refund</div><span class="badge">gagal tapi tertagih</span></div>
		{#if data.candidates.length}
			{#each data.candidates as c}
				<form method="POST" action="?/refund" use:enhance style="padding:11px 14px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
					<input type="hidden" name="request_id" value={c.request_id} />
					<div style="flex:1;min-width:160px">
						<div class="num" style="font-size:12px">{c.request_id}</div>
						<div class="hint" style="font-size:11px">{c.org_name} · {c.model} · {dateTime(String(c.created_at))}</div>
					</div>
					<div class="num" style="font-size:12px">{rp(Number(c.billed_micros))}</div>
					<input class="input" name="reason" placeholder="Alasan" style="width:150px;height:28px;font-size:12px" required />
					<button class="btn btn-sm" type="submit">Refund</button>
				</form>
			{/each}
		{:else}
			<div style="padding:20px">
				<State title="Tidak ada kandidat" body="Tidak ada request gagal yang tertagih pada rentang data saat ini." icon="check" />
			</div>
		{/if}
	</div>

	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Margin per model</div></div>
		<table class="table">
			<thead><tr><th>Model</th><th class="r">Pendapatan</th><th class="r">Modal</th><th class="r">Margin</th></tr></thead>
			<tbody>
				{#each data.marginByModel as m}
					<tr>
						<td class="num" style="font-size:11px">{m.model}</td>
						<td class="r num">{rp(m.revenue)}</td>
						<td class="r num" style="color:var(--ink-soft)">{rp(m.cost)}</td>
						<td class="r num" style="color:var(--accent)">
							{m.revenue ? `${(((m.revenue - m.cost) / m.revenue) * 100).toFixed(1).replace('.', ',')}%` : '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<h2 style="font-size:20px;margin-top:26px">Ledger platform</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	<table class="table">
		<thead><tr><th>Waktu</th><th>Workspace</th><th>Jenis</th><th>Keterangan</th><th class="r">Nominal</th><th class="r">Saldo</th></tr></thead>
		<tbody>
			{#each data.ledger as e}
				<tr>
					<td class="num" style="font-size:11px;color:var(--ink-faint)">{dateTime(String(e.created_at))}</td>
					<td style="font-size:12px">{e.org_name}</td>
					<td><span class="badge" class:badge-ok={Number(e.amount_micros) > 0}>{e.kind}</span></td>
					<td style="font-size:12px;color:var(--ink-soft)">{e.memo}</td>
					<td class="r num">{rp(Number(e.amount_micros))}</td>
					<td class="r num" style="color:var(--ink-soft)">{rp(Number(e.balance_after))}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
