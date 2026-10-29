import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { FormErrorView } from '@/utils/formError';
import type { Unit, UnitHouseholdMember } from '@/types/community';
import type { Vehicle, Pet } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface MyUnitCardProps {
  resources: ResourceClients;
  unitId: string;
}

function unitStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'available': return 'positive';
    case 'vacant': return 'warning';
    case 'under_maintenance': return 'warning';
    case 'blocked': return 'danger';
    default: return 'neutral';
  }
}

export function MyUnitCard({ resources, unitId }: MyUnitCardProps) {
  const unit = useAsync<Unit>((signal) => resources.units.get(unitId, { signal }), [unitId]);
  const household = useAsync<UnitHouseholdMember[]>((signal) => resources.units.listHousehold(unitId, { signal }), [unitId]);
  const vehicles = useAsync<Vehicle[]>((signal) => resources.units.listVehicles(unitId, { signal }), [unitId]);
  const pets = useAsync<Pet[]>((signal) => resources.units.listPets(unitId, { signal }), [unitId]);

  const u = unit.data;
  const members = household.data ?? [];
  const vehicleList = vehicles.data ?? [];
  const petList = pets.data ?? [];

  return (
    <View style={styles.card}>
      <AsyncBoundary loading={unit.loading} error={unit.error} onRetry={unit.reload}>
        {u ? (
          <>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name="home" size={22} color={theme.color.primary} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.unitTitle}>Unit {u.unitNumber}</Text>
                <View style={styles.badges}>
                  <Badge label={humanizeCode(u.unitStatus)} tone={unitStatusTone(u.unitStatus)} />
                  <Badge label={humanizeCode(u.unitType)} tone="neutral" />
                </View>
              </View>
            </View>

            <View style={styles.factRow}>
              <Fact icon="layers-outline" label="Floor" value={u.floor ?? '—'} />
              <Fact icon="bed-outline" label="Beds" value={u.bedrooms != null ? String(u.bedrooms) : '—'} />
              <Fact icon="resize-outline" label="Area" value={u.area != null ? String(u.area) : '—'} />
            </View>
          </>
        ) : null}
      </AsyncBoundary>

      <Group icon="people" tint={theme.color.info} title="Household" count={members.length} loading={household.loading} error={household.error} onRetry={household.reload} emptyText="No household members yet.">
        {members.map((m) => (
          <Line
            key={m.residentId}
            icon={m.residentType === 'owner' ? 'key' : 'person'}
            tint={m.residentType === 'owner' ? theme.color.success : theme.color.info}
            title={m.name}
            subtitle={humanizeCode(m.relationship)}
            trailing={humanizeCode(m.residentType)}
          />
        ))}
      </Group>

      <Group icon="car-sport" tint="#cf5500" title="Vehicles" count={vehicleList.length} loading={vehicles.loading} error={vehicles.error} onRetry={vehicles.reload} emptyText="No vehicles registered.">
        {vehicleList.map((v) => (
          <Line key={v.id} icon="car-sport" tint="#cf5500" title={v.registrationNumber} subtitle={humanizeCode(v.vehicleType)} />
        ))}
      </Group>

      <Group icon="paw" tint="#8250df" title="Pets" count={petList.length} loading={pets.loading} error={pets.error} onRetry={pets.reload} emptyText="No pets registered.">
        {petList.map((p) => (
          <Line key={p.id} icon="paw" tint="#8250df" title={p.name ?? humanizeCode(p.petType)} subtitle={humanizeCode(p.petType)} />
        ))}
      </Group>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color={theme.color.mutedText} />
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

function Group({
  icon,
  tint,
  title,
  count,
  loading,
  error,
  onRetry,
  emptyText,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  count: number;
  loading: boolean;
  error: FormErrorView | null;
  onRetry: () => void;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.divider} />
      <View style={styles.groupHeader}>
        <View style={[styles.groupIcon, { backgroundColor: `${tint}1f` }]}>
          <Ionicons name={icon} size={14} color={tint} />
        </View>
        <Text style={styles.groupTitle}>{title}</Text>
        {count > 0 ? <Text style={styles.groupCount}>{count}</Text> : null}
      </View>
      <AsyncBoundary loading={loading} error={error} empty={!loading && count === 0} emptyMessage={emptyText} onRetry={onRetry}>
        <View style={styles.lines}>{children}</View>
      </AsyncBoundary>
    </View>
  );
}

function Line({ icon, tint, title, subtitle, trailing }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; subtitle: string; trailing?: string }) {
  return (
    <View style={styles.line}>
      <View style={[styles.lineIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={styles.lineText}>
        <Text style={styles.lineTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.lineSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {trailing ? <Text style={styles.lineTrailing}>{trailing}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  headerIcon: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: theme.spacing.xs },
  unitTitle: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  factRow: {
    flexDirection: 'row',
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
  },
  fact: { flex: 1, alignItems: 'center', gap: 2 },
  factValue: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text },
  factLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  group: { gap: theme.spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  groupIcon: { width: 26, height: 26, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text },
  groupCount: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '700' },
  lines: { gap: theme.spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  lineIcon: { width: 34, height: 34, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1 },
  lineTitle: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text },
  lineSubtitle: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 1 },
  lineTrailing: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.mutedText },
});
