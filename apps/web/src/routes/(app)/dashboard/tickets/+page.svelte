<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { dateTime } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Tiket</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Komplain dan pertanyaan. Support melihat konteks request bila Anda menyertakan ID.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}
{#if form?.created}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Tiket dibuat.</div>
{/if}

<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Daftar tiket</div><span class="badge">{data.tickets.length}</span></div>
		{#if data.tickets.length}
			{#each data.tickets as t}
				<a
					href="?id={t.id}"
					style="display:block;padding:11px 14px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;background:{data.selected?.id === t.id ? 'var(--surface-sunken)' : 'transparent'}"
				>
					<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
						<span style="font-size:13px">{t.subject}</span>
						<span class="badge" class:badge-ok={t.status === 'resolved'}>{t.status}</span>
					</div>
					<div class="hint" style="font-size:11px;margin-top:3px">
						{dateTime(String(t.created_at))} · prioritas {t.priority}{t.request_id ? ` · ${t.request_id}` : ''}
					</div>
				</a>
			{/each}
		{:else}
			<div style="padding:18px"><State title="Belum ada tiket" icon="ticket" body="Kirim tiket pertama dari formulir di samping." /></div>
		{/if}
	</div>

	<div style="display:flex;flex-direction:column;gap:14px">
		{#if data.selected}
			<div class="card">
				<div class="card-head">
					<div>
						<div style="font-size:14px;font-weight:500">{data.selected.subject}</div>
						<div class="hint" style="font-size:11px">
							{data.selected.status} · SLA {dateTime(String(data.selected.sla_due))}
						</div>
					</div>
					{#if data.selected.request_id}<span class="badge num">{data.selected.request_id}</span>{/if}
				</div>
				<div style="display:flex;flex-direction:column">
					{#each data.messages as m}
						<div style="padding:12px 16px;border-bottom:1px solid var(--line)">
							<div class="hint" style="font-size:11px;margin-bottom:4px">{m.author} · {dateTime(String(m.created_at))}</div>
							<p style="font-size:13px;white-space:pre-wrap">{m.body}</p>
						</div>
					{/each}
				</div>
				<form method="POST" action="?/reply" use:enhance style="padding:14px;display:flex;gap:8px;align-items:end">
					<input type="hidden" name="ticket_id" value={data.selected.id} />
					<div class="field" style="flex:1">
						<label class="label" for="body">Balasan</label>
						<input class="input" id="body" name="body" placeholder="Tambahkan informasi" required />
					</div>
					<button class="btn" type="submit">Kirim</button>
				</form>
				{#if data.selected.request_id}
					<div style="padding:0 14px 12px">
						<a href="/dashboard/logs?request={data.selected.request_id}" style="font-size:12px">Lihat request terkait →</a>
					</div>
				{/if}
			</div>
		{/if}

		<form method="POST" action="?/create" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:11px">
			<div style="font-size:14px;font-weight:500">Tiket baru</div>
			<div class="field">
				<label class="label" for="subject">Subjek</label>
				<input class="input" id="subject" name="subject" required />
			</div>
			<div class="field">
				<label class="label" for="body">Detail</label>
				<textarea class="textarea" id="body" name="body" rows="4" required></textarea>
			</div>
			<button class="btn" type="submit">Kirim tiket</button>
		</form>
	</div>
</div>
