import { getDb } from '$lib/server/db';
import { rp } from '$lib/format';

export function load() {
	const db = getDb();
	const models = db
		.prepare('SELECT * FROM models WHERE visible = 1 AND enabled = 1 ORDER BY sort LIMIT 5')
		.all() as unknown as {
		id: string;
		label: string;
		context: number;
		input_micros: number;
		output_micros: number;
		markup_pct: number;
	}[];
	const providers = db.prepare('SELECT COUNT(DISTINCT provider) AS n FROM models WHERE enabled = 1').get() as { n: number };
	const totalModels = db.prepare('SELECT COUNT(*) AS n FROM models WHERE enabled = 1').get() as { n: number };
	const usage = db.prepare('SELECT COUNT(*) AS n, COALESCE(AVG(billed_micros),0) AS avg FROM usage').get() as {
		n: number;
		avg: number;
	};

	return {
		models: models.map((m) => ({
			id: m.id,
			label: m.label,
			context: m.context,
			sellInput: Math.round(m.input_micros * (1 + m.markup_pct / 100)),
			sellOutput: Math.round(m.output_micros * (1 + m.markup_pct / 100))
		})),
		stats: [
			{ value: String(totalModels.n), label: 'Model aktif' },
			{ value: String(providers.n), label: 'Provider' },
			{ value: '1 baris', label: 'Perubahan di kode Anda' },
			{ value: 'IDR', label: 'Mata uang tagihan' }
		],
		replayTeaser: [
			{ model: 'openai/gpt-4o', cost: 118_400 * 1_000_000, latency: 2140, win: 0.5 },
			{ model: 'google/gemini-2.5-flash', cost: 24_600 * 1_000_000, latency: 960, win: 0.44 },
			{ model: 'anthropic/claude-haiku-4-5', cost: 61_200 * 1_000_000, latency: 740, win: 0.56 }
		],
		features: [
			{
				icon: 'replay',
				title: 'Replay Lab',
				body: 'Jalankan ulang request yang sudah tercatat di model kandidat, dengan batas biaya keras, lalu terapkan hasilnya sebagai aturan routing per tag.'
			},
			{
				icon: 'route',
				title: 'Fallback dan circuit breaker',
				body: 'Provider error, timeout, atau 429 dialihkan ke model berikutnya. Rute yang gagal berulang dibuka sementara agar tidak memperlambat request.'
			},
			{
				icon: 'card',
				title: 'Saldo prabayar transparan',
				body: 'Hold sebelum request, settle setelah selesai. Ledger append-only, biaya modal dan harga jual tercatat terpisah per request.'
			},
			{
				icon: 'shield',
				title: 'Privasi sebagai default',
				body: 'Prompt dan respons tidak disimpan kecuali Anda mengaktifkannya per project. Isi log dienkripsi AES-GCM dengan kunci per project.'
			},
			{
				icon: 'list',
				title: 'Log yang bisa ditindaklanjuti',
				body: 'Filter per tag, model, key, dan status. Setiap baris membawa request ID, token, biaya, dan latency untuk diajukan ke support.'
			},
			{
				icon: 'tag',
				title: 'Tag sebagai unit keputusan',
				body: 'Kirim header X-Tag untuk mengelompokkan beban kerja. Estimator dan aturan routing bekerja pada tag, bukan pada seluruh trafik.'
			}
		],
		exampleCost: Math.round(usage.avg || 62_000)
	};
}
