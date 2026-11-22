/** Format uang. Semua nilai uang di sistem ini adalah bilangan bulat mikro-IDR. */
export const MICRO = 1_000_000;

export function rp(micros: number, opts: { compact?: boolean } = {}): string {
	const idr = micros / MICRO;
	if (opts.compact) {
		if (Math.abs(idr) >= 1_000_000) return `Rp${(idr / 1_000_000).toFixed(1).replace('.', ',')} jt`;
		if (Math.abs(idr) >= 1_000) return `Rp${(idr / 1_000).toFixed(1).replace('.', ',')} rb`;
	}
	return `Rp${Math.round(idr).toLocaleString('id-ID')}`;
}

export function usd(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

export const idr = (n: number) => n * MICRO;

export function pct(n: number, digits = 1): string {
	return `${n.toFixed(digits).replace('.', ',')}%`;
}

export function num(n: number): string {
	return n.toLocaleString('id-ID');
}

export function ms(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(2).replace('.', ',')} dtk` : `${Math.round(n)} ms`;
}

export function tokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} rb` : String(n);
}

export function relative(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const m = Math.round(diff / 60000);
	if (m < 1) return 'baru saja';
	if (m < 60) return `${m} mnt lalu`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} jam lalu`;
	const d = Math.round(h / 24);
	return d === 1 ? 'kemarin' : `${d} hari lalu`;
}

export function dateTime(iso: string): string {
	return new Date(iso).toLocaleString('id-ID', {
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function dateOnly(iso: string): string {
	return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
