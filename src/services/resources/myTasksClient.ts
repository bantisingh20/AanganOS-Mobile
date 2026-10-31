import type { ApiClient } from '@/services/api/client';
import type { MyTaskSummaryItem, MyTaskCard } from '@/types/myTasks';
import { buildQuery } from './query';

export class MyTasksClient {
  constructor(private readonly api: ApiClient) {}

  summary(options?: { signal?: AbortSignal }): Promise<MyTaskSummaryItem[]> {
    return this.api.get<MyTaskSummaryItem[]>(
      '/api/v1/my-tasks/summary',
      options?.signal ? { signal: options.signal } : undefined,
    );
  }

  cards(type?: string, options?: { signal?: AbortSignal }): Promise<MyTaskCard[]> {
    const qs = buildQuery(type && type !== 'all' ? { type } : {});
    return this.api.get<MyTaskCard[]>(
      `/api/v1/my-tasks${qs}`,
      options?.signal ? { signal: options.signal } : undefined,
    );
  }
}
