<script lang="ts">
	import { enhance } from '$app/forms';
	import { rp, dateOnly } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Promo</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Bonus kredit, persentase, atau nominal. Satu kode hanya bisa dipakai sekali per akun.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.saved}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Tersimpan.</div>
{/if}

<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<table class="table">
			<thead><tr><th>Kode</th><th>Jenis</th><th class="r">Nilai</th><th class="r">Min top up</th><th class="r">Terpakai</th><th class="r">Berlaku</th><th></th></tr></thead>
			<tbody>
				{#each data.promos as p}
					<tr>
						<td class="num" style="font-size:12px">{p.code}</td>
						<td style="font-size:12px">{p.type}</td>
						<td class="r num">{p.type === 'percent' ? `${p.value}%` : rp(Number(p.value))}</td>
						<td class="r num">{rp(Number(p.min_topup_micros), { compact: true })}</td>
						<td class="r num">{p.redeemed}/{p.max_redemptions}</td>
						<td class="r num" style="font-size:11px;color:var(--ink-faint)">{p.expires_at ? dateOnly(String(p.expires_at)) : '—'}</td>
						<td class="r">
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="code" value={p.code} />
								<button class="btn btn-sm btn-ghost" type="submit">{p.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<form method="POST" action="?/create" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:11px">
		<div style="font-size:14px;font-weight:500">Kode baru</div>
		<div class="field">
			<label class="label" for="code">Kode</label>
			<input class="input num" id="code" name="code" placeholder="HEMAT20" required />
		</div>
		<div class="field">
			<label class="label" for="type">Jenis</label>
			<select class="select" id="type" name="type">
				<option value="percent">persentase dari top up</option>
				<option value="credit">bonus kredit (Rp)</option>
				<option value="amount">potongan nominal (Rp)</option>
			</select>
		</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
			<div class="field">
				<label class="label" for="value">Nilai</label>
				<input class="input num" id="value" name="value" type="number" min="1" value="20" />
			</div>
			<div class="field">
				<label class="label" for="min_topup">Min top up (Rp)</label>
				<input class="input num" id="min_topup" name="min_topup" type="number" min="0" value="100000" />
			</div>
			<div class="field">
				<label class="label" for="max">Kuota</label>
				<input class="input num" id="max" name="max" type="number" min="1" value="100" />
			</div>
			<div class="field">
				<label class="label" for="days">Berlaku (hari)</label>
				<input class="input num" id="days" name="days" type="number" min="1" value="30" />
			</div>
		</div>
		<button class="btn btn-primary" type="submit">Buat promo</button>
	</form>
</div>

<h2 style="font-size:20px;margin-top:26px">Redemption terakhir</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	{#if data.redemptions.length}
		<table class="table">
			<thead><tr><th>Kode</th><th>Workspace</th><th class="r">Waktu</th></tr></thead>
			<tbody>
				{#each data.redemptions as r}
					<tr>
						<td class="num" style="font-size:12px">{r.code}</td>
						<td style="font-size:12px">{r.org_name ?? '—'}</td>
						<td class="r num" style="font-size:11px;color:var(--ink-faint)">{dateOnly(String(r.created_at))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="hint" style="padding:14px">Belum ada redemption.</p>
	{/if}
</div>
