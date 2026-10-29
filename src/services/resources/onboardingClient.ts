import type { ApiClient } from '@/services/api/client';
import type { LoginResponse } from '@/types/auth';

export interface OnboardingConfig {
  readonly selfRegistrationEnabled: boolean;
  readonly visitPassValidityAmount: number;
  readonly visitPassValidityUnit: string;
  readonly visitPassValidityText: string;
  readonly recurringExpiringSoonDays: number;
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

export interface PublicWing {
  readonly id: string;
  readonly name: string;
  readonly level: string;
  readonly parentId: string | null;
}

export interface SelfRegisterBody {
  readonly communityId: string;
  readonly unitId: string;
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
  readonly password: string;
  readonly code: string;
  readonly photoBase64?: string;
  readonly residentType?: string;
  readonly dateOfBirth?: string;
  readonly gender?: string;
  readonly moveInDate?: string;
  readonly govtIdType?: string;
  readonly selfieBase64?: string;
  readonly govtIdFrontBase64?: string;
  readonly govtIdBackBase64?: string;
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

  listWings(communityId: string, options?: { signal?: AbortSignal }): Promise<PublicWing[]> {
    return this.api.get<PublicWing[]>(`/api/v1/public/communities/${communityId}/wings`, {
      ...options,
      anonymous: true,
    });
  }

  listUnits(communityId: string, wingId?: string, search?: string, options?: { signal?: AbortSignal }): Promise<PublicUnit[]> {
    const params = new URLSearchParams();
    if (wingId) params.set('wingId', wingId);
    if (search) params.set('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.api.get<PublicUnit[]>(`/api/v1/public/communities/${communityId}/units${qs}`, {
      ...options,
      anonymous: true,
    });
  }

  requestOtp(phone: string): Promise<{ valid: boolean }> {
    return this.api.post<{ valid: boolean }>('/api/v1/public/register/request-otp', {
      body: { phone },
      anonymous: true,
    });
  }

  verifyOtp(phone: string, code: string): Promise<{ valid: boolean }> {
    return this.api.post<{ valid: boolean }>('/api/v1/public/register/verify-otp', {
      body: { phone, code },
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
