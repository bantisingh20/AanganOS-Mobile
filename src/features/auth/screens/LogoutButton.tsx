import React, { useState } from 'react';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/store/AuthContext';

export interface LogoutButtonProps {
  title?: string;
  variant?: 'primary' | 'secondary';
  testID?: string;
}

/**
 * Session/profile-area logout action (Req 1.3). Calls `logout` from the auth context, which
 * invalidates the session server-side (best effort), clears the secure token store, and flips the
 * shell back to the auth flow. Reuses the accessible {@link AppButton}; shown busy while in flight.
 */
export function LogoutButton({
  title = 'Log out',
  variant = 'secondary',
  testID = 'logout-button',
}: LogoutButtonProps) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await logout();
    } finally {
      // If logout succeeded the component unmounts with the authenticated tree; guard anyway.
      setBusy(false);
    }
  };

  return (
    <AppButton
      title={title}
      variant={variant}
      onPress={onPress}
      loading={busy}
      accessibilityHint="Signs you out and returns to the login screen"
      testID={testID}
    />
  );
}
