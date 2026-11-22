<script lang="ts">
	import { enhance } from '$app/forms';
	import { dateOnly, num } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Pengaturan</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">Privasi data, retensi, dan notifikasi keluar.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{:else if form?.saved}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Perubahan disimpan.</div>
{:else if form?.purged !== undefined}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">
		{form.purged} log dihapus.
	</div>
{/if}

<div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start">
	<div style="display:flex;flex-direction:column;gap:14px">
		{#each data.projects as p}
			<form method="POST" action="?/project" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
				<input type="hidden" name="id" value={p.id} />
				<div style="display:flex;justify-content:space-between;gap:12px">
					<div>
						<div style="font-size:14px;font-weight:500">{p.name}</div>
						<div class="hint">Default: prompt dan respons tidak disimpan.</div>
					</div>
					{#if p.zdr}<span class="badge badge-warn">ZDR</span>{/if}
				</div>
				<label style="display:flex;gap:9px;align-items:start;font-size:13px">
					<input type="checkbox" name="logging" checked={!!p.logging_enabled} style="margin-top:3px;accent-color:var(--accent)" />
					<span>
						Simpan prompt dan respons
						<span class="hint" style="display:block">Dibutuhkan Replay Lab. Terenkripsi AES-GCM dengan kunci per project.</span>
					</span>
				</label>
				<label style="display:flex;gap:9px;align-items:start;font-size:13px">
					<input type="checkbox" name="zdr" checked={!!p.zdr} style="margin-top:3px;accent-color:var(--accent)" />
					<span>
						Zero data retention
						<span class="hint" style="display:block">Mematikan logging, cache respons, dan Replay Lab untuk project ini.</span>
					</span>
				</label>
				<div style="display:flex;gap:10px;align-items:end">
					<div class="field" style="width:170px">
						<label class="label" for="retention-{p.id}">Retensi log</label>
						<select class="select" id="retention-{p.id}" name="retention">
							{#each [7, 30, 90] as d}<option value={d} selected={p.retention_days === d}>{d} hari</option>{/each}
						</select>
					</div>
					<button class="btn" type="submit">Simpan</button>
				</div>
			</form>
		{/each}

		<div class="card card-pad">
			<div style="font-size:14px;font-weight:500;margin-bottom:10px">Kebijakan data provider</div>
			<table class="table">
				<thead><tr><th>Provider</th><th>Retensi</th><th>Latihan</th><th>ZDR</th><th class="r">Diverifikasi</th></tr></thead>
				<tbody>
					{#each data.policies as p}
						<tr>
							<td style="text-transform:capitalize">{p.provider}</td>
							<td style="font-size:12px;color:var(--ink-soft)">{p.retention}</td>
							<td>{p.trains_on_data ? 'Ya' : 'Tidak'}</td>
							<td>{p.zdr_available ? 'Ya' : 'Belum diketahui'}</td>
							<td class="r num" style="font-size:12px;color:var(--ink-faint)">{p.verified_at ? dateOnly(String(p.verified_at)) : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="hint" style="margin-top:10px">
				Klaim zero retention hanya ditampilkan bila admin sudah memverifikasi dari dokumen resmi provider.
			</p>
		</div>

		<div class="card card-pad">
			<div style="display:flex;justify-content:space-between;gap:16px;align-items:center">
				<div>
					<div style="font-size:14px;font-weight:500">Log tersimpan</div>
					<div class="hint">{num(data.logCount)} baris. Menghapus log tidak memengaruhi metering atau saldo.</div>
				</div>
				<form method="POST" action="?/purge" use:enhance>
					<button class="btn btn-danger" type="submit">Hapus log kedaluwarsa</button>
				</form>
			</div>
		</div>
	</div>

	<div style="display:flex;flex-direction:column;gap:14px">
		<form method="POST" action="?/org" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
			<div style="font-size:14px;font-weight:500">Workspace</div>
			<div class="field">
				<label class="label" for="name">Nama</label>
				<input class="input" id="name" name="name" value={data.org.name} />
			</div>
			<div class="hint">Slug: <span class="num">{data.org.slug}</span></div>
			<button class="btn btn-sm" type="submit">Simpan</button>
		</form>

		<div class="card" style="overflow:hidden">
			<div class="card-head"><div style="font-size:14px;font-weight:500">Webhook</div></div>
			{#if data.webhooks.length}
				{#each data.webhooks as w}
					<div style="padding:10px 14px;border-bottom:1px solid var(--line)">
						<div class="num" style="font-size:12px;word-break:break-all">{w.url}</div>
						<div class="hint" style="font-size:11px;margin-top:2px">{w.events}</div>
					</div>
				{/each}
			{:else}
				<p class="hint" style="padding:14px">Belum ada webhook.</p>
			{/if}
			<form method="POST" action="?/webhook" use:enhance style="padding:14px;display:flex;flex-direction:column;gap:10px">
				<div class="field">
					<label class="label" for="url">URL</label>
					<input class="input num" id="url" name="url" placeholder="https://contoh.id/hooks/anyllm" required />
				</div>
				<div style="display:flex;flex-direction:column;gap:5px;font-size:12px">
					{#each [['balance.low', 'saldo rendah'], ['key.blocked', 'kunci diblokir'], ['replay.done', 'replay selesai']] as [value, label]}
						<label style="display:flex;gap:7px;align-items:center">
							<input type="checkbox" name="events" value={value} style="accent-color:var(--accent)" />
							<span><span class="num">{value}</span> — {label}</span>
						</label>
					{/each}
				</div>
				<button class="btn btn-sm" type="submit">Tambah webhook</button>
				<p class="hint" style="font-size:11px">Ditandatangani HMAC-SHA256 di header <span class="num">X-Anyllm-Signature</span>.</p>
			</form>
		</div>

		<div class="card card-pad">
			<div style="font-size:14px;font-weight:500;margin-bottom:6px">Data Anda</div>
			<p class="hint" style="margin-bottom:10px">Ekspor seluruh data workspace dalam JSON: usage, ledger, key (tanpa hash), tiket.</p>
			<a class="btn btn-sm" href="/dashboard/settings/export">Ekspor data</a>
		</div>
	</div>
</div>
