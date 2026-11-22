/**
 * Antarmuka pembayaran. Implementasi pertama disimulasikan; bentuknya mengikuti
 * alur QRIS Xendit (charge -> webhook idempoten -> ledger).
 */
export type Charge = {
	providerRef: string;
	status: 'paid' | 'pending' | 'expired';
	method: 'qris' | 'va' | 'ewallet';
	paidAt: string | null;
};

export interface PaymentProvider {
	id: string;
	createCharge(input: { orgId: string; amountMicros: number; idempotencyKey: string }): Promise<Charge>;
}

export class SimulatedProvider implements PaymentProvider {
	id = 'simulated';
	async createCharge(input: { orgId: string; amountMicros: number; idempotencyKey: string }): Promise<Charge> {
		const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		return {
			providerRef: `QRIS-${stamp}-${input.idempotencyKey.slice(0, 6).toUpperCase()}`,
			status: 'paid',
			method: 'qris',
			paidAt: new Date().toISOString()
		};
	}
}

export const payments: PaymentProvider = new SimulatedProvider();

export const MIN_TOPUP_IDR = 25_000;
export const MAX_TOPUP_IDR = 10_000_000;
