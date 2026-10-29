import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Toggle } from '@/components/ui/Toggle';
import { AppButton } from '@/components/ui/AppButton';
import { Badge } from '@/components/ui/Badge';
import { showSuccessAlert } from '@/utils/errorAlert';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { MasterDataKeys } from '@/types/masterData';
import type { CommunicationPreference } from '@/types/resident';
import type { MasterDataEntry } from '@/types/masterData';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';
import { useMyResident } from '@/features/profile/hooks/useMyResident';

export interface CommunicationPreferencesScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Mandatory categories the server always delivers regardless of opt-in (Req 20.4). */
const MANDATORY_CATEGORIES = new Set(['account', 'emergency', 'responder']);

/** A per-category icon + short description so each row reads clearly. */
const CATEGORY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: string; desc: string }> = {
  account: { icon: 'shield-checkmark', tint: theme.color.primary, desc: 'Security & account alerts' },
  emergency: { icon: 'warning', tint: theme.color.danger, desc: 'Emergency & safety alerts' },
  responder: { icon: 'alert-circle', tint: theme.color.danger, desc: 'Security responder alerts' },
  parcel: { icon: 'cube', tint: '#cf5500', desc: 'Deliveries & parcel updates' },
  complaint: { icon: 'construct', tint: theme.color.warning, desc: 'Ticket & complaint updates' },
  invoice: { icon: 'receipt', tint: theme.color.info, desc: 'Invoices & billing' },
  facility_booking: { icon: 'calendar', tint: '#8250df', desc: 'Facility booking updates' },
  document_expiry: { icon: 'document-text', tint: theme.color.info, desc: 'Document expiry reminders' },
  announcement: { icon: 'megaphone', tint: '#8250df', desc: 'Community announcements' },
  visitor: { icon: 'people', tint: theme.color.success, desc: 'Visitor requests' },
  parking: { icon: 'car-sport', tint: theme.color.warning, desc: 'Parking alerts' },
  event: { icon: 'sparkles', tint: '#8250df', desc: 'Resident events' },
};

function metaFor(code: string) {
  return CATEGORY_META[code] ?? { icon: 'notifications' as const, tint: theme.color.primary, desc: 'Notifications' };
}

/**
 * Communication preferences (Req 20.1, 20.2, 66.3): the signed-in resident toggles their per-category
 * opt-in, then saves. A modern card layout — each category is an icon + label + description row with a
 * switch, grouped in a {@link FormSection}; mandatory categories (account/emergency) show an
 * "Always on" badge and are locked. Category labels come from the configurable
 * `Notification_Category` list. Save sends only the changed set and surfaces a success toast.
 */
export function CommunicationPreferencesScreen({ resources, onBack }: CommunicationPreferencesScreenProps) {
  // Resolve the signed-in resident via GET /residents/me (matched by the token's user id server-side)
  // — not residents.list()[0], which can be a stranger for a non-resident principal.
  const me = useMyResident(resources);
  const residentId = me.data?.resident?.id ?? null;

  return (
    <FormScreen title="Notifications" subtitle="Choose what you're notified about" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={me.loading}
        error={me.error}
        empty={!me.loading && residentId === null}
        emptyMessage="We couldn't find a resident profile linked to your account."
        onRetry={me.reload}
      >
        {residentId ? <PreferencesEditor resources={resources} residentId={residentId} /> : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

function PreferencesEditor({ resources, residentId }: { resources: ResourceClients; residentId: string }) {
  const prefs = useAsync<CommunicationPreference[]>(
    (signal) => resources.residents.getCommunicationPreferences(residentId, { signal }),
    [residentId],
  );
  const categories = useAsync<MasterDataEntry[]>(
    (signal) => resources.masterData.list(MasterDataKeys.NotificationCategory, { includeInactive: true, signal }),
    [],
  );

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (prefs.data) {
      setDraft(Object.fromEntries(prefs.data.map((p) => [p.category, p.optedIn])));
    }
  }, [prefs.data]);

  const save = useAsyncAction(() =>
    resources.residents.setCommunicationPreferences(
      residentId,
      Object.entries(draft).map(([category, optedIn]) => ({ category, optedIn })),
    ),
  );

  const labelFor = (code: string): string =>
    categories.data?.find((c) => c.code === code)?.label ?? humanizeCode(code);

  const list = prefs.data ?? [];
  const optional = list.filter((p) => !MANDATORY_CATEGORIES.has(p.category));
  const mandatory = list.filter((p) => MANDATORY_CATEGORIES.has(p.category));

  return (
    <AsyncBoundary
      loading={prefs.loading}
      error={prefs.error}
      empty={!prefs.loading && list.length === 0}
      emptyMessage="No communication categories are configured."
      onRetry={prefs.reload}
    >
      <FormSection title="Your notifications" subtitle="Turn categories on or off" icon="notifications" tint={theme.color.primary}>
        {optional.map((p, i) => {
          const m = metaFor(p.category);
          return (
            <PrefRow
              key={p.category}
              icon={m.icon}
              tint={m.tint}
              label={labelFor(p.category)}
              description={m.desc}
              value={draft[p.category] ?? p.optedIn}
              onChange={(v) => setDraft((d) => ({ ...d, [p.category]: v }))}
              testID={`pref-${p.category}`}
              last={i === optional.length - 1}
            />
          );
        })}
        {optional.length === 0 ? <Text style={styles.note}>No optional categories to configure.</Text> : null}
      </FormSection>

      {mandatory.length > 0 ? (
        <FormSection title="Always on" subtitle="Security & emergency notices can't be turned off" icon="lock-closed" tint={theme.color.danger}>
          {mandatory.map((p, i) => {
            const m = metaFor(p.category);
            return (
              <View key={p.category} style={[styles.lockedRow, i === mandatory.length - 1 ? null : styles.rowBorder]}>
                <View style={[styles.icon, { backgroundColor: `${m.tint}1f` }]}>
                  <Ionicons name={m.icon} size={18} color={m.tint} />
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.label}>{labelFor(p.category)}</Text>
                  <Text style={styles.description}>{m.desc}</Text>
                </View>
                <Badge label="Always on" tone="neutral" />
              </View>
            );
          })}
        </FormSection>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          title="Save preferences"
          loading={save.running}
          onPress={async () => {
            if (await save.run()) {
              showSuccessAlert('Your notification preferences were saved.', 'Saved');
              prefs.reload();
            }
          }}
          accessibilityHint="Save your communication preferences"
        />
      </View>
    </AsyncBoundary>
  );
}

/** One optional-category row: icon + label + description + switch, with a divider. */
function PrefRow({
  icon,
  tint,
  label,
  description,
  value,
  onChange,
  testID,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.prefRow, last ? null : styles.rowBorder]}>
      <View style={[styles.icon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.toggleWrap}>
        <Toggle label={label} description={description} value={value} onValueChange={onChange} {...(testID ? { testID } : {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  toggleWrap: { flex: 1 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.border },
  icon: { width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, gap: 2 },
  label: { fontSize: theme.fontSize.body, color: theme.color.text, fontWeight: '600' },
  description: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  note: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  actions: { marginTop: theme.spacing.sm },
});
