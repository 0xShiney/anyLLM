<script lang="ts">
	import { enhance } from '$app/forms';
	import { rp, num, relative, dateTime } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Customer</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">{data.list.length} workspace. Klik untuk detail dan koreksi saldo.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.saved}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Aksi tersimpan dan tercatat di audit log.</div>
{:else if form?.viewing}
	<div class="card card-pad" style="border-color:#e3cf9f;background:var(--warn-soft);margin-bottom:14px;font-size:13px;color:var(--warn)">
		Mode lihat sebagai pengguna aktif (baca saja). Akses tercatat dengan alasan Anda.
	</div>
{/if}

<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<table class="table">
			<thead><tr><th>Workspace</th><th class="r">Saldo</th><th class="r">Biaya 30 h</th></tr></thead>
			<tbody>
				{#each data.list as c}
					<tr style="background:{data.org?.id === c.id ? 'var(--surface-sunken)' : 'transparent'}">
						<td>
							<a href="?id={c.id}" style="color:var(--ink);text-decoration:none;font-size:13px">{c.name}</a>
							<div class="hint" style="font-size:11px">{c.owner_email}</div>
						</td>
						<td class="r num">{rp(Number(c.balance_micros), { compact: true })}</td>
						<td class="r num">{rp(Number(c.spend_30d), { compact: true })}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.org}
		<div style="display:flex;flex-direction:column;gap:14px">
			<div class="card card-pad">
				<div style="display:flex;justify-content:space-between;gap:16px;align-items:start">
					<div>
						<div style="font-family:var(--font-display);font-size:22px">{data.org.name}</div>
						<div class="hint">{data.org.slug} · dibuat {dateTime(String(data.org.created_at))}</div>
					</div>
					<div style="text-align:right">
						<div class="label">Saldo</div>
						<div class="num" style="font-size:20px">{rp(Number(data.org.balance_micros))}</div>
					</div>
				</div>
				{#if data.usage}
					<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);margin-top:14px;border:1px solid var(--line)">
						{#each [{ l: 'Request 30 h', v: num(data.usage.requests) }, { l: 'Biaya', v: rp(data.usage.spend) }, { l: 'p95', v: `${data.usage.p95Latency} ms` }, { l: 'Error', v: num(data.usage.errors) }] as m}
							<div style="background:var(--surface);padding:9px 12px">
								<div class="label" style="font-size:10px">{m.l}</div>
								<div class="num" style="font-size:12px;margin-top:2px">{m.v}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="card card-pad">
				<div style="font-size:14px;font-weight:500;margin-bottom:10px">Koreksi saldo / kompensasi</div>
				<form method="POST" action="?/credit" use:enhance style="display:flex;flex-direction:column;gap:10px">
					<input type="hidden" name="org_id" value={data.org.id} />
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
						<div class="field">
							<label class="label" for="amount">Nominal (Rp, negatif = debit)</label>
							<input class="input num" id="amount" name="amount" type="number" step="1000" placeholder="12000" required />
						</div>
						<div class="field">
							<label class="label" for="kind">Jenis</label>
							<select class="select" id="kind" name="kind">
								<option value="adjust">koreksi</option>
								<option value="grant">kredit kompensasi</option>
							</select>
						</div>
					</div>
					<div class="field">
						<label class="label" for="reason">Alasan</label>
						<input class="input" id="reason" name="reason" required />
					</div>
					<div style="display:flex;gap:8px">
						<button class="btn btn-sm" type="submit">Simpan koreksi</button>
						<button class="btn btn-sm btn-ghost" type="submit" formaction="?/viewAs">Lihat sebagai pengguna</button>
					</div>
					<p class="hint">Batas per peran: support Rp500.000, admin Rp5.000.000, finance tanpa batas.</p>
				</form>
			</div>

			<div class="card" style="overflow:hidden">
				<div class="card-head"><div style="font-size:14px;font-weight:500">Kunci API</div><span class="badge">{data.keys.length}</span></div>
				{#each data.keys as k}
					<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--line)">
						<div>
							<div style="font-size:12px">{k.name} · <span class="num">{k.prefix}…</span></div>
							<div class="hint" style="font-size:11px">{k.rpm} rpm · terakhir {k.last_used_at ? relative(String(k.last_used_at)) : 'belum'}</div>
						</div>
						{#if k.status === 'active'}
							<form method="POST" action="?/blockKey" use:enhance>
								<input type="hidden" name="prefix" value={k.prefix} />
								<input type="hidden" name="reason" value="Pemblokiran dari detail customer" />
								<button class="btn btn-sm btn-danger" type="submit">Blokir</button>
							</form>
						{:else}
							<span class="badge badge-danger">{k.status}</span>
						{/if}
					</div>
				{/each}
				{#if !data.keys.length}<p class="hint" style="padding:14px">Belum ada kunci.</p>{/if}
			</div>

			<div class="card" style="overflow:hidden">
				<div class="card-head"><div style="font-size:14px;font-weight:500">Ledger terakhir</div></div>
				{#each data.ledger as e}
					<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--line);font-size:12px">
						<span style="color:var(--ink-soft)">{e.memo}</span>
						<span class="num" style="color:{Number(e.amount_micros) > 0 ? 'var(--accent)' : 'var(--ink)'}">{rp(Number(e.amount_micros))}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
