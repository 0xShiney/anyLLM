<script lang="ts">
	import { enhance } from '$app/forms';
	import { num } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Workspace</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">{data.user.orgName} · anggota, project, dan peran.</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}
{#if form?.invited}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">
		Undangan tercatat untuk {form.invited}. Email undangan belum dikirim karena provider email belum dipilih.
	</div>
{/if}

<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<div class="card-head"><div style="font-size:14px;font-weight:500">Anggota</div><span class="badge">{data.members.length}</span></div>
		<table class="table">
			<thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th class="r">Status</th></tr></thead>
			<tbody>
				{#each data.members as m}
					<tr>
						<td style="font-size:13px">{m.name}</td>
						<td style="font-size:12px;color:var(--ink-soft)">{m.email}</td>
						<td><span class="badge">{m.role}</span></td>
						<td class="r">{#if m.pending}<span class="badge badge-warn">undangan</span>{:else}<span class="badge badge-ok">aktif</span>{/if}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<form method="POST" action="?/invite" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
		<div style="font-size:14px;font-weight:500">Undang anggota</div>
		<div class="field">
			<label class="label" for="email">Email</label>
			<input class="input" id="email" name="email" type="email" required />
		</div>
		<div class="field">
			<label class="label" for="role">Peran</label>
			<select class="select" id="role" name="role">
				<option value="developer">developer — key, log, replay</option>
				<option value="admin">admin — semua kecuali billing</option>
				<option value="viewer">viewer — hanya baca</option>
			</select>
		</div>
		<button class="btn" type="submit">Kirim undangan</button>
		<p class="hint">Anggota baru masuk sebagai akun tertunda sampai password dibuat lewat email.</p>
	</form>
</div>

<h2 style="font-size:20px;margin-top:26px">Project</h2>
<div class="card" style="margin-top:12px;overflow:hidden">
	<table class="table">
		<thead><tr><th>Project</th><th class="r">Kunci aktif</th><th class="r">Logging</th><th class="r">Retensi</th><th class="r">ZDR</th></tr></thead>
		<tbody>
			{#each data.projects as p}
				<tr>
					<td style="font-size:13px">{p.name}</td>
					<td class="r num">{num(Number(p.keys))}</td>
					<td class="r">{p.logging_enabled ? 'aktif' : 'mati'}</td>
					<td class="r num">{p.retention_days} hari</td>
					<td class="r">{#if p.zdr}<span class="badge badge-warn">aktif</span>{:else}—{/if}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
