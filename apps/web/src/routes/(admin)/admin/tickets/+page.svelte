<script lang="ts">
	import { enhance } from '$app/forms';
	import { rp, dateTime } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Tiket</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Konteks request tampil otomatis. Isi prompt hanya muncul bila pelanggan mengaktifkan logging.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.saved}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Tersimpan.</div>
{/if}

<div style="display:grid;grid-template-columns:1fr 1.5fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		{#each data.tickets as t}
			<a
				href="?id={t.id}"
				style="display:block;padding:11px 14px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;background:{data.selected?.id === t.id ? 'var(--surface-sunken)' : 'transparent'}"
			>
				<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
					<span style="font-size:13px">{t.subject}</span>
					<span class="badge" class:badge-danger={t.priority === 'high'}>{t.priority}</span>
				</div>
				<div class="hint" style="font-size:11px;margin-top:3px">{t.org_name} · {t.status} · {dateTime(String(t.created_at))}</div>
			</a>
		{/each}
		{#if !data.tickets.length}<p class="hint" style="padding:14px">Tidak ada tiket.</p>{/if}
	</div>

	{#if data.selected}
		<div style="display:flex;flex-direction:column;gap:14px">
			<div class="card">
				<div class="card-head">
					<div>
						<div style="font-size:14px;font-weight:500">{data.selected.subject}</div>
						<div class="hint" style="font-size:11px">{data.selected.org_name} · SLA {dateTime(String(data.selected.sla_due))}</div>
					</div>
					{#if data.selected.request_id}<a class="badge num" href="/dashboard/logs?request={data.selected.request_id}">{data.selected.request_id}</a>{/if}
				</div>
				{#if data.request}
					<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border-bottom:1px solid var(--line)">
						{#each [{ l: 'Model', v: data.request.model }, { l: 'Status', v: data.request.status }, { l: 'Ditagih', v: rp(Number(data.request.billed_micros)) }, { l: 'Latency', v: `${data.request.latency_ms} ms` }] as x}
							<div style="background:var(--surface-sunken);padding:8px 12px">
								<div class="label" style="font-size:10px">{x.l}</div>
								<div class="num" style="font-size:11px;margin-top:2px">{x.v}</div>
							</div>
						{/each}
					</div>
				{/if}
				<div style="max-height:280px;overflow-y:auto">
					{#each data.messages as m}
						<div style="padding:10px 16px;border-bottom:1px solid var(--line);background:{m.internal ? 'var(--warn-soft)' : 'transparent'}">
							<div class="hint" style="font-size:11px;margin-bottom:3px">
								{m.author} · {dateTime(String(m.created_at))}{m.internal ? ' · catatan internal' : ''}
							</div>
							<p style="font-size:13px;white-space:pre-wrap">{m.body}</p>
						</div>
					{/each}
				</div>
				<form method="POST" action="?/reply" use:enhance style="padding:12px;display:flex;flex-direction:column;gap:8px">
					<input type="hidden" name="ticket_id" value={data.selected.id} />
					<textarea class="textarea" name="body" rows="2" placeholder="Balasan" required></textarea>
					<div style="display:flex;justify-content:space-between;align-items:center">
						<label style="font-size:12px;display:flex;gap:6px;align-items:center">
							<input type="checkbox" name="internal" style="accent-color:var(--accent)" /> catatan internal
						</label>
						<button class="btn btn-sm" type="submit">Kirim</button>
					</div>
				</form>
			</div>

			<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
				<form method="POST" action="?/status" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:9px">
					<input type="hidden" name="ticket_id" value={data.selected.id} />
					<div style="font-size:13px;font-weight:500">Status & assignee</div>
					<select class="select" name="status">
						{#each ['open', 'pending', 'resolved'] as s}<option value={s} selected={data.selected.status === s}>{s}</option>{/each}
					</select>
					<input class="input" name="assignee" placeholder={String(data.selected.assignee ?? 'support@anyllm.id')} />
					<button class="btn btn-sm" type="submit">Simpan</button>
				</form>

				<form method="POST" action="?/compensate" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:9px">
					<input type="hidden" name="ticket_id" value={data.selected.id} />
					<div style="font-size:13px;font-weight:500">Kredit kompensasi</div>
					<input class="input num" name="amount" type="number" min="1" step="1000" placeholder="12000" required />
					<input class="input" name="reason" placeholder="Alasan" required />
					<button class="btn btn-sm" type="submit">Berikan kredit</button>
					<p class="hint" style="font-size:11px">Batas support Rp500.000 per aksi. Saldo customer: {rp(data.org?.balance_micros ?? 0)}</p>
				</form>
			</div>
		</div>
	{/if}
</div>
