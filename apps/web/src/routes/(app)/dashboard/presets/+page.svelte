<script lang="ts">
	import { enhance } from '$app/forms';
	import State from '$lib/components/State.svelte';
	import { dateTime } from '$lib/format';
	let { data, form } = $props();

	const grouped = $derived(
		Object.entries(
			data.presets.reduce<Record<string, typeof data.presets>>((acc, p) => {
				const slug = String(p.slug);
				(acc[slug] ??= []).push(p);
				return acc;
			}, {})
		)
	);
</script>

<header style="margin-bottom:20px">
	<h1 style="font-size:28px;line-height:1.15">Presets</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Konfigurasi bernama di server. Panggil dengan <span class="num" style="font-size:12px">"model": "@preset/slug"</span>.
		Setiap perubahan membuat versi baru.
	</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}
{#if form?.ok}
	<div class="card card-pad" style="border-color:#bfd8cb;background:var(--accent-soft);margin-bottom:14px;font-size:13px">Preset disimpan sebagai versi baru.</div>
{/if}

<div style="display:grid;grid-template-columns:1.45fr 1fr;gap:14px;align-items:start">
	<div style="display:flex;flex-direction:column;gap:12px">
		{#if grouped.length === 0}
			<State title="Belum ada preset" body="Buat preset untuk menyimpan daftar model dan parameter yang sering dipakai." icon="layers" />
		{/if}
		{#each grouped as [slug, versions]}
			{@const latest = versions[0]}
			{@const config = JSON.parse(String(latest.config))}
			<div class="card">
				<div class="card-head">
					<div>
						<div class="num" style="font-size:14px">@{slug}</div>
						<div class="hint">Versi {latest.version} · {versions.length} versi tersimpan</div>
					</div>
					<span class="badge badge-ok">aktif</span>
				</div>
				<div style="padding:14px 20px;display:flex;flex-direction:column;gap:10px">
					<div>
						<div class="label">Urutan model</div>
						<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
							{#each config.models as m}<span class="chip num" style="font-size:11px">{m}</span>{/each}
						</div>
					</div>
					<div style="display:flex;gap:28px;font-size:12px;color:var(--ink-soft)">
						<span>temperature <span class="num">{config.params?.temperature ?? '—'}</span></span>
						<span>cache <span class="num">{config.cache?.enabled ? `${config.cache.ttl_seconds}s` : 'mati'}</span></span>
						<span>sort <span class="num">{config.provider?.sort ?? '—'}</span></span>
					</div>
					{#if config.system_prompt}
						<div>
							<div class="label">System prompt</div>
							<p style="font-size:12px;color:var(--ink-soft);margin-top:4px">{config.system_prompt}</p>
						</div>
					{/if}
				</div>
				{#if versions.length > 1}
					<div style="border-top:1px solid var(--line);padding:10px 20px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ink-faint)">
						{#each versions.slice(1) as v}
							<span>v{v.version} · {dateTime(String(v.created_at))}</span>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<form method="POST" action="?/create" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
		<div style="font-size:14px;font-weight:500">Preset baru / versi baru</div>
		<div class="field">
			<label class="label" for="slug">Slug</label>
			<input class="input num" id="slug" name="slug" placeholder="murah-cepat" required />
			<span class="hint">Nama yang sama membuat versi baru.</span>
		</div>
		<div class="field">
			<span class="label">Model (urut fallback)</span>
			<div style="max-height:170px;overflow-y:auto;display:flex;flex-direction:column;gap:5px">
				{#each data.models as m, i}
					<label style="display:flex;gap:8px;align-items:center;font-size:12px">
						<input type="checkbox" name="models" value={m.id} checked={i < 2} style="accent-color:var(--accent)" />
						<span class="num">{m.id}</span>
					</label>
				{/each}
			</div>
		</div>
		<div class="field">
			<label class="label" for="temperature">Temperature</label>
			<input class="input num" id="temperature" name="temperature" type="number" step="0.1" min="0" max="2" value="0.3" />
		</div>
		<div class="field">
			<label class="label" for="system_prompt">System prompt (opsional)</label>
			<textarea class="textarea" id="system_prompt" name="system_prompt" rows="3"></textarea>
		</div>
		<button class="btn btn-primary" type="submit">Simpan preset</button>
	</form>
</div>
