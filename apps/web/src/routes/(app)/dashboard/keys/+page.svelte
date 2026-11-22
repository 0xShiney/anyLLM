<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { rp, num, relative, dateOnly } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">API Keys</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Kunci dipakai di kode Anda. Kami hanya menyimpan hash SHA-256 dan 12 karakter awal untuk ditampilkan.
	</p>
</header>

{#if data.welcome}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:18px">
		<div style="font-size:14px;font-weight:500">Workspace siap. Buat kunci pertama Anda.</div>
		<p style="font-size:13px;color:var(--ink-soft);margin-top:4px">
			Kredit uji Rp25.000 sudah masuk. Setelah kunci dibuat, ganti base URL SDK OpenAI ke
			<span class="num">https://api.anyllm.id/v1</span>.
		</p>
	</div>
{/if}

{#if form?.createdKey}
	<div class="card card-pad" style="border-color:#bfd8cb;margin-bottom:18px">
		<div class="label" style="margin-bottom:8px">Kunci baru — hanya ditampilkan sekali</div>
		<div
			class="num"
			style="font-size:13px;background:var(--surface-sunken);border:1px solid var(--line);padding:10px 12px;border-radius:3px;overflow-x:auto;user-select:all"
		>
			{form.createdKey}
		</div>
		<p class="hint" style="margin-top:8px">Simpan di secret manager. Kunci tidak bisa ditampilkan lagi.</p>
	</div>
{/if}
{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:18px;font-size:13px;color:var(--danger)">
		{form.error}
	</div>
{/if}

<div style="display:grid;grid-template-columns:1.55fr 1fr;gap:14px;align-items:start">
	<div class="card" style="overflow:hidden">
		<div class="card-head">
			<div style="font-size:14px;font-weight:500">Kunci aktif</div>
			<span class="badge">{data.keys.length} total</span>
		</div>
		{#if data.keys.length}
			<table class="table">
				<thead>
					<tr><th>Nama</th><th>Prefix</th><th class="r">Budget / bln</th><th class="r">RPM</th><th class="r">Terpakai 30 h</th><th class="r">Terakhir</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.keys as k}
						<tr>
							<td>
								<div style="font-size:13px">{k.name}</div>
								<div style="font-size:11px;color:var(--ink-faint)">{k.project_name}</div>
							</td>
							<td class="num" style="font-size:12px;color:var(--ink-soft)">{k.prefix}…</td>
							<td class="r num">{k.monthly_budget_micros ? rp(Number(k.monthly_budget_micros), { compact: true }) : '—'}</td>
							<td class="r num">{k.rpm ?? '—'}</td>
							<td class="r num">{rp(Number(k.spend_30d))}</td>
							<td class="r num" style="font-size:12px;color:var(--ink-faint)">
								{k.last_used_at ? relative(String(k.last_used_at)) : 'belum dipakai'}
							</td>
							<td class="r">
								{#if k.status === 'active'}
									<form method="POST" action="?/revoke" use:enhance style="display:inline">
										<input type="hidden" name="id" value={k.id} />
										<button class="btn btn-sm btn-ghost" type="submit">Blokir</button>
									</form>
								{:else}
									<span class="badge badge-danger">{k.status}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div style="padding:20px">
				<State title="Belum ada kunci" body="Buat kunci untuk mulai mengirim request ke gateway." icon="key" />
			</div>
		{/if}
	</div>

	<form method="POST" action="?/create" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:13px">
		<div>
			<div style="font-size:14px;font-weight:500">Buat kunci</div>
			<div class="hint">Kunci mewarisi batas project.</div>
		</div>
		<div class="field">
			<label class="label" for="name">Nama</label>
			<input class="input" id="name" name="name" placeholder="Produksi" required />
		</div>
		<div class="field">
			<label class="label" for="project">Project</label>
			<select class="select" id="project" name="project">
				{#each data.projects as p}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
			<div class="field">
				<label class="label" for="rpm">Batas RPM</label>
				<input class="input num" id="rpm" name="rpm" type="number" min="1" value="600" />
			</div>
			<div class="field">
				<label class="label" for="budget">Budget / bulan (Rp)</label>
				<input class="input num" id="budget" name="budget" type="number" min="0" step="1000" placeholder="0" />
			</div>
		</div>
		<button class="btn btn-primary" type="submit">Buat kunci</button>
		<p class="hint">Budget 0 berarti tanpa batas bulanan selain saldo.</p>
	</form>
</div>

<div class="card card-pad" style="margin-top:14px;display:flex;justify-content:space-between;gap:20px;align-items:center">
	<div>
		<div style="font-size:13px;font-weight:500">Contoh pemakaian</div>
		<div class="hint">Base URL gateway menggantikan base URL OpenAI.</div>
	</div>
	<div class="num" style="font-size:11px;color:var(--ink-soft);background:var(--surface-sunken);padding:8px 10px;border-radius:3px">
		OPENAI_BASE_URL=https://api.anyllm.id/v1
	</div>
</div>
