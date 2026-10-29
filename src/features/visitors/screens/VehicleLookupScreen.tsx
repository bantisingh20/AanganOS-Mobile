import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { VehicleLookupMatch, VehicleLookupResult } from '@/types/gate';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface VehicleLookupScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

function matchLabel(t: VehicleLookupMatch['matchType']): string {
  if (t === 'resident') return 'Resident vehicle';
  if (t === 'visit_pass') return 'Visitor pass';
  return 'Walk-in visitor';
}

function matchTint(t: VehicleLookupMatch['matchType']): string {
  if (t === 'resident') return theme.color.primary;
  return '#cf5500';
}

/**
 * Vehicle lookup — type a plate, see who it belongs to. Shared by resident + security; the feature
 * is only reachable when the signed-in user holds (View, Vehicle). A resident vehicle shows the
 * unit's resident(s); a visitor vehicle shows the visitor + the host unit's resident contacts.
 */
export function VehicleLookupScreen({ resources, onBack }: VehicleLookupScreenProps) {
  const [plate, setPlate] = useState('');
  const [query, setQuery] = useState('');

  const { data, loading, error, reload } = useAsync<VehicleLookupResult | null>(
    (signal) => (query ? resources.gate.lookupVehicle(query, { signal }) : Promise.resolve(null)),
    [query],
  );

  const matches = data?.matches ?? [];
  const submit = () => setQuery(plate.trim());

  return (
    <FormScreen title="Vehicle lookup" subtitle="Find who a vehicle belongs to" {...(onBack ? { onBack } : {})}>
      <AppTextField
        label="Vehicle number"
        value={plate}
        onChangeText={setPlate}
        placeholder="e.g. MH12AB1234"
        autoCapitalize="characters"
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <AppButton title="Look up" onPress={submit} disabled={plate.trim().length === 0} accessibilityHint="Search for this vehicle" />

      {query ? (
        <AsyncBoundary
          loading={loading}
          error={error}
          empty={!loading && matches.length === 0}
          emptyMessage={`No vehicle matching "${query}" was found in your community.`}
          onRetry={reload}
        >
          <View style={styles.list}>
            {matches.map((m, i) => (
              <View key={`${m.matchType}-${i}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconTile, { backgroundColor: `${matchTint(m.matchType)}1f` }]}>
                    <Ionicons name={m.matchType === 'resident' ? 'car-sport' : 'person'} size={22} color={matchTint(m.matchType)} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{m.personName}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {matchLabel(m.matchType)}
                      {m.unitNumber ? ` · Unit ${m.unitNumber}` : ''}
                      {m.vehicleType ? ` · ${humanizeCode(m.vehicleType)}` : ''}
                    </Text>
                    {m.personPhone ? <Text style={styles.cardMeta} numberOfLines={1}>📞 {m.personPhone}</Text> : null}
                  </View>
                  {m.status ? <Badge label={humanizeCode(m.status)} tone="neutral" /> : null}
                </View>

                {m.matchType !== 'resident' && m.hostResidents.length > 0 ? (
                  <View style={styles.hosts}>
                    <Text style={styles.hostsLabel}>Unit contact{m.hostResidents.length > 1 ? 's' : ''}</Text>
                    {m.hostResidents.map((h, hi) => (
                      <View key={hi} style={styles.hostRow}>
                        <Ionicons name="home-outline" size={14} color={theme.color.mutedText} />
                        <Text style={styles.hostText} numberOfLines={1}>
                          {h.name}{h.phone ? ` · ${h.phone}` : ''}{h.residentType ? ` · ${humanizeCode(h.residentType)}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </AsyncBoundary>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginTop: theme.spacing.md },
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
  cardMeta: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  hosts: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border, paddingTop: theme.spacing.sm },
  hostsLabel: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.text },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hostText: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
