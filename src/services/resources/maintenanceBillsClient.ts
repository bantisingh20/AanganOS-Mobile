import type { ApiClient } from '@/services/api/client';
import type { MaintenanceBill, MaintenancePayment } from '@/types/myTasks';

export interface SubmitPaymentBody {
  readonly maintenanceBillId: string;
  readonly amount: number;
  readonly method: string;
  readonly reference?: string;
}

export class MaintenanceBillsClient {
  constructor(private readonly api: ApiClient) {}

  myDue(options?: { signal?: AbortSignal }): Promise<MaintenanceBill[]> {
    return this.api.get<MaintenanceBill[]>(
      '/api/v1/maintenance-bills/me/due',
      options?.signal ? { signal: options.signal } : undefined,
    );
  }

  submitPayment(body: SubmitPaymentBody): Promise<MaintenancePayment> {
    return this.api.post<MaintenancePayment>('/api/v1/maintenance-payments/submit', { body });
  }
}
