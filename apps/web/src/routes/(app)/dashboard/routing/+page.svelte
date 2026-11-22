<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { dateTime } from '$lib/format';
	let { data, form } = $props();

	const active = $derived(data.rules.filter((r) => r.status === 'active'));
	const history = $derived(data.rules.filter((r) => r.status !== 'active'));
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Routing Rules</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Aturan per tag. Model eksplisit di request tetap menang atas aturan.
	</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}

<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Aturan aktif</div><span class="badge">{active.length}</span></div>
		{#if active.length}
			<table class="table">
				<thead><tr><th>Tag</th><th>Model target</th><th>Fallback</th><th class="r">Versi</th><th class="r">Sumber</th><th></th></tr></thead>
				<tbody>
					{#each active as r}
						<tr>
							<td style="font-size:13px">{r.tag}</td>
							<td class="num" style="font-size:12px">{r.target_model}</td>
							<td class="num" style="font-size:12px;color:var(--ink-soft)">{r.fallback_model}</td>
							<td class="r num">v{r.version}</td>
							<td class="r"><span class="badge">{r.source}</span></td>
							<td class="r">
								<form method="POST" action="?/disable" use:enhance>
									<input type="hidden" name="id" value={r.id} />
									<button class="btn btn-sm btn-ghost" type="submit">Nonaktifkan</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div style="padding:20px"><State title="Belum ada aturan aktif" body="Jalankan Replay Lab atau buat aturan manual di samping." icon="route" /></div>
		{/if}
	</div>

	<form method="POST" action="?/create" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
		<div style="font-size:14px;font-weight:500">Aturan manual</div>
		<div class="field">
			<label class="label" for="tag">Tag</label>
			<input class="input" id="tag" name="tag" list="tags" placeholder="ringkasan" required />
			<datalist id="tags">{#each data.tags as t}<option value={t.tag}></option>{/each}</datalist>
		</div>
		<div class="field">
			<label class="label" for="target">Model target</label>
			<select class="select" id="target" name="target">
				{#each data.models as m}<option value={m.id}>{m.id}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="fallback">Fallback</label>
			<select class="select" id="fallback" name="fallback">
				{#each data.models as m}<option value={m.id}>{m.id}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label class="label" for="note">Catatan</label>
			<input class="input" id="note" name="note" placeholder="Alasan perubahan" />
		</div>
		<button class="btn" type="submit">Simpan versi baru</button>
	</form>
</div>

<h2 style="font-size:20px;margin-top:28px">Riwayat versi</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	{#if history.length}
		<table class="table">
			<thead><tr><th>Tag</th><th>Model</th><th class="r">Versi</th><th>Catatan</th><th>Diubah oleh</th><th class="r">Waktu</th><th></th></tr></thead>
			<tbody>
				{#each history as r}
					<tr>
						<td style="font-size:13px">{r.tag}</td>
						<td class="num" style="font-size:12px">{r.target_model}</td>
						<td class="r num">v{r.version}</td>
						<td style="font-size:12px;color:var(--ink-soft)">{r.note ?? '—'}</td>
						<td style="font-size:12px;color:var(--ink-soft)">{r.created_by}</td>
						<td class="r num" style="font-size:12px;color:var(--ink-faint)">{dateTime(String(r.created_at))}</td>
						<td class="r">
							<form method="POST" action="?/rollback" use:enhance>
								<input type="hidden" name="id" value={r.id} />
								<button class="btn btn-sm" type="submit">Kembalikan</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div style="padding:20px"><State title="Belum ada riwayat" body="Setiap perubahan aturan menyimpan versi sebelumnya di sini." icon="clock" /></div>
	{/if}
</div>
