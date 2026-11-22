<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<PublicNav />
<main style="max-width:1120px;margin:0 auto;padding:56px 32px">
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start">
		<div>
			<div class="label" style="margin-bottom:14px">Daftar</div>
			<h1 style="font-size:34px;line-height:1.15;max-width:18ch">Uji pada trafik Anda sendiri.</h1>
			<p style="margin-top:14px;color:var(--ink-soft);max-width:42ch">
				Workspace baru mendapat kredit uji Rp25.000. Tanpa kartu kredit, tanpa langganan. Logging prompt mati sampai Anda
				menyalakannya.
			</p>
			<ol style="margin-top:24px;padding-left:18px;font-size:13px;color:var(--ink-soft);line-height:2">
				<li>Buat workspace dan kunci API pertama.</li>
				<li>Ganti base URL SDK OpenAI ke gateway.</li>
				<li>Kirim request, lihat biaya per request di log.</li>
				<li>Aktifkan logging, jalankan Replay Lab pada satu tag.</li>
			</ol>
		</div>
		<form method="POST" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:14px">
			<div class="field">
				<label class="label" for="name">Nama</label>
				<input class="input" id="name" name="name" value={form?.name ?? ''} required />
			</div>
			<div class="field">
				<label class="label" for="email">Email kerja</label>
				<input class="input" id="email" name="email" type="email" value={form?.email ?? ''} required />
			</div>
			<div class="field">
				<label class="label" for="org">Nama workspace</label>
				<input class="input" id="org" name="org" value={form?.orgName ?? ''} required />
			</div>
			<div class="field">
				<label class="label" for="password">Password</label>
				<input class="input" id="password" name="password" type="password" minlength="8" required />
				<span class="hint">Minimal 8 karakter.</span>
			</div>
			<p class="hint">
				Dengan mendaftar Anda menyetujui Syarat Layanan dan Kebijakan Privasi. Dokumen hukum masih draf dan perlu
				ditinjau konsultan.
			</p>
			{#if form?.error}
				<p class="err">{form.error}</p>
			{/if}
			<button class="btn btn-primary" type="submit">Buat workspace</button>
		</form>
	</div>
</main>
