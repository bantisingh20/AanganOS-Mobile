import type { ApiClient } from '../api/client';
import type { LoginResponse } from '../models/auth';

export interface OnboardingConfig {
  readonly selfRegistrationEnabled: boolean;
}

export interface PublicCommunity {
  readonly id: string;
  readonly name: string;
  readonly communityType: string;
}

export interface PublicUnit {
  readonly id: string;
  readonly unitNumber: string;
  readonly wingId: string | null;
}

export interface SelfRegisterBody {
  readonly communityId: string;
  readonly unitId: string;
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
  readonly password: string;
  readonly photoBase64?: string;
}

export interface SelfRegisterResult {
  readonly residentId: string;
  readonly login: LoginResponse;
}

export class OnboardingClient {
  constructor(private readonly api: ApiClient) {}

  getConfig(options?: { signal?: AbortSignal }): Promise<OnboardingConfig> {
    return this.api.get<OnboardingConfig>('/api/v1/public/onboarding-config', {
      ...options,
      anonymous: true,
    });
  }

  searchCommunities(search?: string, options?: { signal?: AbortSignal }): Promise<PublicCommunity[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '?search=';
    return this.api.get<PublicCommunity[]>(`/api/v1/public/communities${qs}`, {
      ...options,
      anonymous: true,
    });
  }

  listUnits(communityId: string, search?: string, options?: { signal?: AbortSignal }): Promise<PublicUnit[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.api.get<PublicUnit[]>(`/api/v1/public/communities/${communityId}/units${qs}`, {
      ...options,
      anonymous: true,
    });
  }

  selfRegister(body: SelfRegisterBody): Promise<SelfRegisterResult> {
    return this.api.post<SelfRegisterResult>('/api/v1/residents/self-register', {
      body,
      anonymous: true,
    });
  }
}
