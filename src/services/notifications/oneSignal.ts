import type { ApiClient } from '@/services/api/client';
import type { AppConfig } from '@/constants';

/**
 * Minimal structural slice of the `react-native-onesignal` v5 SDK we use. Declared here (rather
 * than importing the module's types) so the shared package type-checks without the native module
 * installed, and so tests can pass a fake. The app passes the real `OneSignal` default export.
 */
export interface OneSignalSdk {
  initialize(appId: string): void;
  Notifications: {
    requestPermission(fallbackToSettings: boolean): Promise<boolean>;
  };
  User: {
    pushSubscription: {
      /** The OneSignal subscription (player) id for this device, once registered. */
      getIdAsync(): Promise<string | null>;
      /** Fired when the subscription id becomes available / changes. */
      addEventListener(
        event: 'change',
        listener: (change: { current: { id?: string | null } }) => void,
      ): void;
      removeEventListener(
        event: 'change',
        listener: (change: { current: { id?: string | null } }) => void,
      ): void;
    };
  };
}

/** Shape POSTed to the backend device endpoint to associate this device with the user. */
export interface DeviceRegistration {
  readonly oneSignalPlayerId: string;
  readonly platform: 'ios' | 'android';
  readonly appKind: 'resident' | 'guard';
}

export interface RegisterDeviceOptions {
  oneSignal: OneSignalSdk;
  config: AppConfig;
  api: ApiClient;
  platform: 'ios' | 'android';
  appKind: 'resident' | 'guard';
  /** Max time to wait for the player id to appear (ms). */
  timeoutMs?: number;
}

/**
 * Initialize OneSignal with the app id from config (no hardcoded secret), request push permission,
 * obtain this device's OneSignal player id, and send it to the backend device endpoint so the
 * server can target this device (Req 11.1). Returns the player id, or null if it never arrived.
 *
 * The player id can lag behind init, so we read it and also race a `change` subscription.
 */
export async function registerDevice(options: RegisterDeviceOptions): Promise<string | null> {
  const { oneSignal, config, api, platform, appKind, timeoutMs = 10_000 } = options;

  // No OneSignal app id configured (e.g. a dev build without push) -> skip registration.
  if (!config.oneSignalAppId) {
    return null;
  }
  oneSignal.initialize(config.oneSignalAppId);
  await oneSignal.Notifications.requestPermission(true);

  const playerId = await waitForPlayerId(oneSignal, timeoutMs);
  if (!playerId) {
    return null;
  }

  const registration: DeviceRegistration = {
    oneSignalPlayerId: playerId,
    platform,
    appKind,
  };
  await api.post<unknown>(config.deviceRegisterPath, {
    body: registration,
    // Idempotent per device id so repeated app launches don't create duplicate device rows.
    idempotencyKey: `device:${appKind}:${playerId}`,
  });

  return playerId;
}

/** Resolve the player id, either immediately or from the first `change` event, within a timeout. */
function waitForPlayerId(oneSignal: OneSignalSdk, timeoutMs: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = (change: { current: { id?: string | null } }) => {
      const id = change.current.id;
      if (id) {
        finish(id);
      }
    };
    const finish = (id: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      oneSignal.User.pushSubscription.removeEventListener('change', onChange);
      resolve(id);
    };

    oneSignal.User.pushSubscription.addEventListener('change', onChange);

    void oneSignal.User.pushSubscription.getIdAsync().then((id) => {
      if (id) {
        finish(id);
      }
    });

    timer = setTimeout(() => finish(null), timeoutMs);
  });
}
