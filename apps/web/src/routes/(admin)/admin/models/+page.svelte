<script lang="ts">
	import { enhance } from '$app/forms';
	import { rp, dateTime } from '$lib/format';
	let { data, form } = $props();
	let picked = $state('');
	const selected = $derived(picked || String(data.models[0]?.id ?? ''));
	const chosen = $derived(data.models.find((m) => m.id === selected));
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:20px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Model & Harga</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Harga modal dan markup. Semua perubahan masuk audit log.</p>
	</div>
	<form method="POST" action="?/sync" use:enhance>
		<button class="btn btn-sm" type="submit">Tarik harga dari provider</button>
	</form>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.saved}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Perubahan disimpan.</div>
{:else if form?.synced !== undefined}
	<div class="card card-pad" style="border-color:#e3cf9f;background:var(--warn-soft);margin-bottom:14px;font-size:13px;color:var(--warn)">
		{form.synced} usulan harga dicatat di riwayat. Tidak ada yang diterapkan otomatis.
	</div>
{/if}

<div class="card" style="overflow:hidden">
	<table class="table">
		<thead>
			<tr><th>Model</th><th class="r">Modal input</th><th class="r">Modal output</th><th class="r">Markup</th><th class="r">Jual input</th><th class="r">Status</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.models as m}
				<tr>
					<td>
						<div class="num" style="font-size:12px">{m.id}</div>
						<div class="hint" style="font-size:11px">{m.label}</div>
					</td>
					<td class="r num">{rp(Number(m.input_micros))}</td>
					<td class="r num">{rp(Number(m.output_micros))}</td>
					<td class="r num">{Number(m.markup_pct).toFixed(0)}%</td>
					<td class="r num" style="color:var(--accent)">{rp(Number(m.input_micros) * (1 + Number(m.markup_pct) / 100))}</td>
					<td class="r" style="display:flex;gap:4px;justify-content:flex-end">
						<span class="badge" class:badge-ok={!!m.enabled} class:badge-danger={!m.enabled}>{m.enabled ? 'on' : 'off'}</span>
						<span class="badge">{m.visible ? 'tampil' : 'sembunyi'}</span>
					</td>
					<td class="r">
						<div style="display:flex;gap:4px;justify-content:flex-end">
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="id" value={m.id} />
								<input type="hidden" name="field" value="enabled" />
								<input type="hidden" name="reason" value="Toggle kill switch dari panel admin" />
								<button class="btn btn-sm btn-ghost" type="submit">{m.enabled ? 'Matikan' : 'Aktifkan'}</button>
							</form>
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="id" value={m.id} />
								<input type="hidden" name="field" value="visible" />
								<button class="btn btn-sm btn-ghost" type="submit">{m.visible ? 'Sembunyikan' : 'Tampilkan'}</button>
							</form>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:14px;margin-top:14px;align-items:start">
	<form method="POST" action="?/update" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:11px">
		<div style="font-size:14px;font-weight:500">Ubah harga</div>
		<div class="field">
			<label class="label" for="id">Model</label>
			<select class="select" id="id" name="id" bind:value={picked}>
				{#each data.models as m}<option value={m.id}>{m.id}</option>{/each}
			</select>
		</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
			<div class="field">
				<label class="label" for="input">Modal input (Rp/1 jt)</label>
				<input class="input num" id="input" name="input" type="number" min="0" step="10" value={chosen ? Math.round(Number(chosen.input_micros) / 1_000_000) : 0} />
			</div>
			<div class="field">
				<label class="label" for="output">Modal output (Rp/1 jt)</label>
				<input class="input num" id="output" name="output" type="number" min="0" step="10" value={chosen ? Math.round(Number(chosen.output_micros) / 1_000_000) : 0} />
			</div>
		</div>
		<div class="field">
			<label class="label" for="markup">Markup (%)</label>
			<input class="input num" id="markup" name="markup" type="number" min="0" max="200" step="1" value={chosen ? Number(chosen.markup_pct) : 15} />
		</div>
		<div class="field">
			<label class="label" for="reason">Alasan</label>
			<input class="input" id="reason" name="reason" placeholder="Sinkronisasi harga provider November" required />
		</div>
		<button class="btn btn-primary" type="submit">Simpan harga</button>
		<p class="hint">Baris riwayat hanya ditulis bila nilai berubah.</p>
	</form>

	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Riwayat harga</div></div>
		<table class="table">
			<thead><tr><th>Model</th><th>Field</th><th class="r">Dari</th><th class="r">Ke</th><th>Oleh</th><th class="r">Waktu</th></tr></thead>
			<tbody>
				{#each data.history as h}
					<tr>
						<td class="num" style="font-size:11px">{h.model}</td>
						<td style="font-size:12px">{h.field}</td>
						<td class="r num" style="color:var(--ink-faint)">{h.old_value ? rp(Number(h.old_value)) : '—'}</td>
						<td class="r num">{h.new_value ? rp(Number(h.new_value)) : '—'}</td>
						<td style="font-size:11px;color:var(--ink-soft)">{h.actor}</td>
						<td class="r num" style="font-size:11px;color:var(--ink-faint)">{dateTime(String(h.created_at))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if !data.history.length}<p class="hint" style="padding:14px">Belum ada perubahan harga.</p>{/if}
	</div>
</div>
