import type { ApiClient } from '../api/client';
import type { SecureTokenStore } from './tokenStore';
import type {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '../models/auth';

/**
 * Thin auth facade over the API client + token store, wired to `/api/v1/auth/*` (Req 1, 2).
 * Login stores the token in the secure store; logout revokes server-side and clears local state.
 * Pre-auth calls (login/forgot/reset) are made anonymous (no bearer). Tokens are never logged.
 */
export class AuthService {
  constructor(
    private readonly api: ApiClient,
    private readonly tokenStore: SecureTokenStore,
  ) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    const login = await this.api.post<LoginResponse>('/api/v1/auth/login', {
      body: request,
      anonymous: true,
    });
    await this.tokenStore.setFromLogin(login);
    return login;
  }

  /**
   * Silent re-auth: swap the stored refresh token for a fresh access token (+ rotated refresh),
   * with no password. Called by the API client on a 401 and on cold start when the access token has
   * expired. Persists the new tokens and returns the new access token. Throws (and the caller
   * clears the session → login) when there's no refresh token or the server rejects it.
   */
  async refresh(): Promise<string> {
    const refreshToken = await this.tokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    // Anonymous: the access token may be expired, so don't send a (stale) bearer.
    const result = await this.api.post<LoginResponse>('/api/v1/auth/refresh', {
      body: { refreshToken },
      anonymous: true,
    });
    await this.tokenStore.setFromLogin(result);
    return result.accessToken;
  }

  async logout(): Promise<void> {
    try {
      // Authenticated call; the server derives the session from the bearer token's jti.
      await this.api.post<{ loggedOut: boolean }>('/api/v1/auth/logout');
    } finally {
      // Always clear locally even if the network call fails — the user intends to be logged out.
      await this.tokenStore.clear();
    }
  }

  forgotPassword(request: ForgotPasswordRequest): Promise<{ message: string }> {
    return this.api.post<{ message: string }>('/api/v1/auth/password/forgot', {
      body: request,
      anonymous: true,
    });
  }

  /**
   * Verify the OTP for the SAME identifier (email/phone) the user entered, WITHOUT consuming it, so
   * the verify screen can show valid/invalid before the user picks a new password. Anonymous.
   */
  verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    return this.api.post<VerifyOtpResponse>('/api/v1/auth/password/verify-otp', {
      body: request,
      anonymous: true,
    });
  }

  resetPassword(request: ResetPasswordRequest): Promise<{ passwordReset: boolean }> {
    return this.api.post<{ passwordReset: boolean }>('/api/v1/auth/password/reset', {
      body: request,
      anonymous: true,
    });
  }
}
