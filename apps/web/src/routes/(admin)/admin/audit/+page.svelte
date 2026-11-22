<script lang="ts">
	import { dateTime } from '$lib/format';
	let { data } = $props();
</script>

<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:20px">
	<div>
		<h1 style="font-size:28px;line-height:1.15">Audit Log</h1>
		<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Hanya bisa ditambah. Tidak ada tombol ubah atau hapus.</p>
	</div>
	<form method="GET" style="display:flex;gap:6px">
		<select class="select" name="action" style="width:auto;min-width:180px">
			<option value="">Semua aksi</option>
			{#each data.actions as a}<option value={a.action} selected={data.action === a.action}>{a.action}</option>{/each}
		</select>
		<button class="btn btn-sm" type="submit">Filter</button>
	</form>
</header>

<div class="card" style="overflow:hidden">
	<table class="table">
		<thead><tr><th>Waktu</th><th>Aktor</th><th>Peran</th><th>Aksi</th><th>Target</th><th>Alasan</th></tr></thead>
		<tbody>
			{#each data.rows as r}
				<tr>
					<td class="num" style="font-size:11px;color:var(--ink-faint)">{dateTime(String(r.created_at))}</td>
					<td style="font-size:12px">{r.actor_email}</td>
					<td><span class="badge">{r.role}</span></td>
					<td class="num" style="font-size:11px">{r.action}</td>
					<td class="num" style="font-size:11px;color:var(--ink-soft)">{r.target}</td>
					<td style="font-size:12px;color:var(--ink-soft)">{r.reason}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if !data.rows.length}<p class="hint" style="padding:16px">Belum ada entri.</p>{/if}
</div>
