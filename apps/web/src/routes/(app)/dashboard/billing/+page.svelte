<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { rp, dateTime, dateOnly } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Billing</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Saldo prabayar dalam rupiah. Setiap perubahan menulis entri baru di ledger; entri lama tidak pernah diubah.
	</p>
</header>

{#if form?.paid}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">
		Top up {form.paid.ref} berhasil: {rp(form.paid.amountMicros)}.
		{#if form.paid.bonus}Bonus promo {rp(form.paid.bonus)} ditambahkan.{/if}
	</div>
{/if}
{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}

<div style="display:grid;grid-template-columns:1fr 1.3fr;gap:14px;align-items:start">
	<div style="display:flex;flex-direction:column;gap:14px">
		<div class="card card-pad">
			<div class="label">Saldo tersedia</div>
			<div class="num" style="font-size:32px;margin:8px 0 4px">{rp(data.balance)}</div>
			<div class="hint">Termasuk kredit promo. Saldo yang ditahan untuk request berjalan tidak dihitung.</div>
		</div>

		<form method="POST" action="?/topup" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
			<div>
				<div style="font-size:14px;font-weight:500">Top up</div>
				<div class="hint">Provider: {data.provider} (simulasi QRIS). Nominal langsung masuk saldo.</div>
			</div>
			<div class="field">
				<label class="label" for="amount">Nominal (Rp)</label>
				<input class="input num" id="amount" name="amount" type="number" min={data.minTopup} max={data.maxTopup} step="1000" value="250000" required />
				<span class="hint">Min Rp{data.minTopup.toLocaleString('id-ID')} · maks Rp{data.maxTopup.toLocaleString('id-ID')}</span>
			</div>
			<div class="field">
				<label class="label" for="promo">Kode promo (opsional)</label>
				<input class="input num" id="promo" name="promo" placeholder="HEMAT20" />
			</div>
			<input type="hidden" name="idempotency" value={data.idempotency} />
			<button class="btn btn-primary" type="submit">Bayar dengan QRIS</button>
			<p class="hint">
				Pembayaran disimulasikan. Integrasi Xendit/Midtrans memakai antarmuka <span class="num">PaymentProvider</span> yang sama.
			</p>
		</form>

		{#if data.promos.length}
			<div class="card card-pad">
				<div class="label" style="margin-bottom:8px">Promo aktif</div>
				{#each data.promos as p}
					<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:12px">
						<span class="num">{p.code}</span>
						<span style="color:var(--ink-soft)">
							{p.type === 'percent' ? `${p.value}%` : rp(Number(p.value), { compact: true })} · min {rp(Number(p.min_topup_micros), { compact: true })}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Ledger</div><span class="badge">{data.ledger.length} entri</span></div>
		{#if data.ledger.length}
			<table class="table">
				<thead><tr><th>Waktu</th><th>Jenis</th><th>Keterangan</th><th class="r">Nominal</th><th class="r">Saldo</th></tr></thead>
				<tbody>
					{#each data.ledger as e}
						<tr>
							<td class="num" style="font-size:12px;color:var(--ink-faint)">{dateTime(String(e.created_at))}</td>
							<td><span class="badge" class:badge-ok={Number(e.amount_micros) > 0}>{e.kind}</span></td>
							<td style="font-size:12px;color:var(--ink-soft)">{e.memo}</td>
							<td class="r num" style="color:{Number(e.amount_micros) > 0 ? 'var(--accent)' : 'var(--ink)'}">
								{Number(e.amount_micros) > 0 ? '+' : ''}{rp(Number(e.amount_micros))}
							</td>
							<td class="r num" style="color:var(--ink-soft)">{rp(Number(e.balance_after))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div style="padding:20px"><State title="Belum ada transaksi" body="Top up pertama akan muncul di sini." icon="card" /></div>
		{/if}
	</div>
</div>

<h2 style="font-size:20px;margin-top:26px">Invoice</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	{#if data.invoices.length}
		<table class="table">
			<thead><tr><th>Referensi</th><th>Provider</th><th class="r">Nominal</th><th class="r">Status</th><th class="r">Tanggal</th></tr></thead>
			<tbody>
				{#each data.invoices as i}
					<tr>
						<td class="num" style="font-size:12px">{i.provider_ref}</td>
						<td style="font-size:12px;text-transform:capitalize">{i.provider}</td>
						<td class="r num">{rp(Number(i.amount_micros))}</td>
						<td class="r"><span class="badge" class:badge-ok={i.status === 'paid'}>{i.status}</span></td>
						<td class="r num" style="font-size:12px;color:var(--ink-faint)">{dateOnly(String(i.paid_at ?? i.created_at))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div style="padding:20px"><State title="Belum ada invoice" body="Invoice dibuat otomatis untuk setiap top up." icon="card" /></div>
	{/if}
</div>
