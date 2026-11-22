<script lang="ts">
	import { enhance } from '$app/forms';
	import { rp, ms, num } from '$lib/format';
	let { data, form } = $props();
</script>

<header style="margin-bottom:18px">
	<h1 style="font-size:28px;line-height:1.15">Playground</h1>
	<p style="color:var(--ink-soft);font-size:13px;margin-top:4px">
		Membandingkan 2–3 model pada prompt yang sama. Request melewati gateway, jadi biayanya ikut tercatat dengan tag
		<span class="num">playground</span>.
	</p>
</header>

{#if form?.error}
	<div class="card card-pad" style="border-color:#e2bcb8;background:var(--danger-soft);margin-bottom:14px;font-size:13px;color:var(--danger)">{form.error}</div>
{/if}

<form method="POST" action="?/run" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:12px">
	<div class="field">
		<label class="label" for="prompt">Prompt</label>
		<textarea class="textarea" id="prompt" name="prompt" rows="4" required>{form?.prompt ?? 'Ringkas transkrip rapat menjadi 3 poin keputusan.'}</textarea>
	</div>
	<div>
		<div class="label" style="margin-bottom:6px">Model (maks 3)</div>
		<div style="display:flex;gap:14px;flex-wrap:wrap">
			{#each data.models as m, i}
				<label style="display:flex;gap:6px;align-items:center;font-size:12px">
					<input type="checkbox" name="models" value={m.id} checked={i < 2} style="accent-color:var(--accent)" />
					<span class="num">{m.id}</span>
				</label>
			{/each}
		</div>
	</div>
	<div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
		<span class="hint">Saldo: <span class="num">{rp(data.balance)}</span></span>
		<button class="btn btn-primary" type="submit">Jalankan</button>
	</div>
</form>

{#if form?.results}
	<div style="display:grid;grid-template-columns:repeat({form.results.length},1fr);gap:12px;margin-top:14px">
		{#each form.results as r}
			<div class="card" style="display:flex;flex-direction:column;overflow:hidden">
				<div class="card-head" style="padding:10px 14px">
					<div>
						<div class="num" style="font-size:12px">{r.model}</div>
						<div class="hint" style="font-size:11px">
							{r.ok ? `${ms(r.latency)} · ${rp(r.billed)}` : 'gagal'}
							{#if r.ok && r.simulated}· mock{/if}
						</div>
					</div>
					{#if r.ok}<span class="badge badge-ok">ok</span>{:else}<span class="badge badge-danger">error</span>{/if}
				</div>
				<pre
					class="num"
					style="margin:0;padding:14px;font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--ink-soft);flex:1">{r.text}</pre
				>
				{#if r.ok}
					<div style="border-top:1px solid var(--line);padding:8px 14px;font-size:11px;color:var(--ink-faint)">
						{num(r.promptTokens)} token masuk · {num(r.completionTokens)} keluar
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
