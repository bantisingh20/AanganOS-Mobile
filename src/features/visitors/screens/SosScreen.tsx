import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { FormBanner } from '@/components/ui/FormBanner';
import { Select } from '@/components/ui/Select';
import { useAsync, useAsyncAction } from '@/hooks';
import { useAuth } from '@/store/AuthContext';
import { theme } from '@/theme';
import { SosAlertStatus } from '@/types/gate';
import type { PagedData } from '@/types/envelope';
import type { SosAlert } from '@/types/gate';
import type { Community } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { gateStatusTone, humanizeCode } from '@/utils/status';

export interface SosScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/**
 * Guard SOS (Req 27.3, 27.4) — redesigned to the shared card style. Raise an emergency alert for a
 * community (notifies the responder audience immediately) and acknowledge/resolve active alerts. The
 * raising user is the signed-in guard (the token's `sub`, from {@link useAuth}); no user id is
 * hardcoded/typed. The target community is picked from the guard's authorized communities so the
 * alert carries the right `CommunityId`. An active alert stays active until acked/resolved (Req 27.4).
 */
export function SosScreen({ resources, onBack }: SosScreenProps) {
  const { userId } = useAuth();
  const [community, setCommunity] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const communities = useAsync<PagedData<Community>>(
    (signal) => resources.communities.list({ pageSize: 50 }, {}, { signal }),
    [],
  );

  // Default to the sole community when the guard is scoped to one.
  useEffect(() => {
    const items = communities.data?.items ?? [];
    if (!community && items.length === 1 && items[0]) {
      setCommunity(items[0].id);
    }
  }, [communities.data, community]);

  const active = useAsync<PagedData<SosAlert>>(
    (signal) => resources.securityOps.listSos({ pageSize: 25, sort: '-raisedAtUtc' }, { status: SosAlertStatus.Active }, { signal }),
    [],
  );

  const raise = useAsyncAction(() => {
    if (!community || !userId) {
      return Promise.reject(new Error('Missing community or user'));
    }
    return resources.securityOps.raiseSos({
      communityId: community,
      raisedByUserId: userId,
      ...(location.trim() ? { location: location.trim() } : {}),
    });
  });

  const acknowledge = useAsyncAction((id: string) => {
    if (!userId) return Promise.reject(new Error('No user'));
    return resources.securityOps.acknowledgeSos(id, userId);
  });

  const resolve = useAsyncAction((id: string) => {
    if (!userId) return Promise.reject(new Error('No user'));
    return resources.securityOps.resolveSos(id, userId);
  });

  const communityOptions = (communities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }));
  const activeItems = active.data?.items ?? [];

  return (
    <FormScreen title="SOS" subtitle="Raise or manage an emergency alert" {...(onBack ? { onBack } : {})}>
      {!userId ? (
        <FormBanner message="Your session is missing a user id; please sign in again to raise an SOS." tone="error" />
      ) : null}

      <FormSection title="Raise an alert" subtitle="Notifies responders immediately" icon="warning" tint={theme.color.danger}>
        {communityOptions.length > 1 ? (
          <Select
            label="Community"
            value={community}
            options={communityOptions}
            onChange={setCommunity}
            placeholder="Select the community"
          />
        ) : null}
        <AppTextField
          label="Location (optional)"
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Main gate, Tower B lobby"
        />
        {raise.error ? <FormBanner message={raise.error.message} tone="error" /> : null}
        {notice ? <FormBanner message={notice} tone="success" /> : null}
        <AppButton
          title="Raise SOS"
          variant="danger"
          loading={raise.running}
          disabled={!community || !userId}
          onPress={async () => {
            setNotice(null);
            if (await raise.run()) {
              setNotice('SOS raised. Responders have been notified.');
              setLocation('');
              active.reload();
            }
          }}
          accessibilityHint="Raise an emergency SOS alert for this community"
        />
      </FormSection>

      <Text style={styles.sectionLabel}>ACTIVE ALERTS</Text>
      {acknowledge.error ? <FormBanner message={acknowledge.error.message} tone="error" /> : null}
      {resolve.error ? <FormBanner message={resolve.error.message} tone="error" /> : null}
      <AsyncBoundary
        loading={active.loading}
        error={active.error}
        empty={!active.loading && activeItems.length === 0}
        emptyMessage="No active SOS alerts."
        onRetry={active.reload}
      >
        <View style={styles.list}>
          {activeItems.map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.iconTile, { backgroundColor: `${theme.color.danger}1f` }]}>
                  <Ionicons name="warning" size={22} color={theme.color.danger} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{a.location ?? 'SOS alert'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>Raised {formatTime(a.raisedAtUtc)}</Text>
                </View>
                <Badge label={humanizeCode(a.status)} tone={gateStatusTone(a.status)} />
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <AppButton
                    title="Acknowledge"
                    variant="secondary"
                    disabled={!userId || a.status !== SosAlertStatus.Active}
                    loading={acknowledge.running}
                    onPress={async () => {
                      if (await acknowledge.run(a.id)) active.reload();
                    }}
                    accessibilityHint="Acknowledge this SOS alert"
                  />
                </View>
                <View style={styles.flex}>
                  <AppButton
                    title="Resolve"
                    disabled={!userId}
                    loading={resolve.running}
                    onPress={async () => {
                      if (await resolve.run(a.id)) active.reload();
                    }}
                    accessibilityHint="Resolve this SOS alert"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </AsyncBoundary>
    </FormScreen>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.mutedText, letterSpacing: 0.5, marginTop: theme.spacing.sm },
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  flex: { flex: 1 },
});
