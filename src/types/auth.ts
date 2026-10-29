/** Typed auth payloads — mirror the backend `/api/v1/auth/*` request/response bodies. */

/** `POST /auth/login` body. Identifier is email or phone. */
export interface LoginRequest {
  readonly identifier: string;
  readonly password: string;
  /**
   * Optional push target of the signing-in device (OneSignal player id). When present the backend
   * registers/replaces this device and signs the user out on their previous device
   * (single-active-session). Omitted when push isn't wired — session revocation still applies.
   */
  readonly oneSignalPlayerId?: string;
  /** Optional device platform: "android" / "ios" / "web". */
  readonly platform?: string;
}

/** The signed-in principal's profile summary returned at login/refresh (mirror of `LoginUserDto`). */
export interface LoginUser {
  readonly userId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly residentId: string | null;
  readonly communityId: string | null;
  readonly communityName: string | null;
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly roles: string[];
  readonly permissions: string[];
}

/** `POST /auth/login` and `/auth/refresh` success data: access token + roles + refresh token + the user profile. */
export interface LoginResponse {
  readonly accessToken: string;
  /** ISO-8601 UTC expiry (serialized `DateTime`). */
  readonly expiresAtUtc: string;
  readonly roles: string[];
  /** Opaque one-time-use refresh token for silent re-auth; stored securely, swapped at `/auth/refresh`. */
  readonly refreshToken: string;
  /** The signed-in user's profile summary (name, community, permissions, ...). */
  readonly user: LoginUser;
}

/** `POST /auth/password/forgot` body. */
export interface ForgotPasswordRequest {
  readonly identifier: string;
}

/** `POST /auth/password/verify-otp` body — checks (without consuming) the code for this identifier. */
export interface VerifyOtpRequest {
  readonly identifier: string;
  readonly code: string;
}

/** `POST /auth/password/verify-otp` success data. */
export interface VerifyOtpResponse {
  readonly valid: boolean;
}

/** `POST /auth/password/reset` body (OTP flow). */
export interface ResetPasswordRequest {
  readonly identifier: string;
  readonly code: string;
  readonly newPassword: string;
}
