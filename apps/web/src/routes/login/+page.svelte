<script lang="ts">
	import PublicNav from '$lib/components/PublicNav.svelte';
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<PublicNav />
<main class="wrap" style="padding:56px 0;max-width:1120px;margin:0 auto;padding-left:32px;padding-right:32px">
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start">
		<div>
			<div class="label" style="margin-bottom:14px">Masuk</div>
			<h1 style="font-size:34px;line-height:1.15;max-width:16ch">Selamat datang kembali.</h1>
			<p style="margin-top:14px;color:var(--ink-soft);max-width:40ch">
				Dashboard menampilkan biaya, log, dan Replay Lab untuk workspace Anda.
			</p>
			<div class="card" style="margin-top:26px;padding:14px 16px;background:var(--surface-sunken)">
				<div class="label" style="margin-bottom:8px">Akun demo</div>
				<div class="num" style="font-size:12px;line-height:1.9">
					dita@kanaya.studio · demo1234<br />
					admin@anyllm.id · demo1234<br />
					finance@anyllm.id · demo1234
				</div>
			</div>
		</div>
		<form method="POST" use:enhance class="card card-pad" style="display:flex;flex-direction:column;gap:14px">
			<div class="field">
				<label class="label" for="email">Email</label>
				<input class="input" id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="email" required />
			</div>
			<div class="field">
				<label class="label" for="password">Password</label>
				<input class="input" id="password" name="password" type="password" autocomplete="current-password" required />
			</div>
			{#if form?.error}
				<p class="err">{form.error}</p>
			{/if}
			<button class="btn btn-primary" type="submit">Masuk</button>
			<p style="font-size:12px;color:var(--ink-faint)">
				Belum punya akun? <a href="/signup">Daftar</a>.
			</p>
		</form>
	</div>
</main>
