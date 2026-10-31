import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormSection } from '@/components/ui/FormSection';
import { parseUtc } from '@/utils/datetime';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { EntityCard } from '@/components/ui/EntityCard';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { BadgeTone } from '@/components/ui/Badge';
import type { Unit, UnitHistory, UnitHouseholdMember } from '@/types/community';
import type { Vehicle, Pet } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface UnitDetailViewProps {
  resources: ResourceClients;
  unitId: string;
  /** When the caller already has the unit (e.g. from the list), skip re-fetching it. */
  initialUnit?: Unit;
  /** Include ownership/tenancy history (Req 16.4). Admin shows it; the resident self-view may skip. */
  showHistory?: boolean;
}

/** Unit status → badge tone (configurable codes, unknown falls back to neutral). */
function unitStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'available': return 'positive';
    case 'occupied': return 'neutral';
    case 'vacant': return 'warning';
    case 'under_maintenance': return 'warning';
    case 'blocked': return 'danger';
    default: return 'neutral';
  }
}

/**
 * The shared unit detail body (reused by the admin unit detail and the resident self-view) — a modern
 * card layout: a hero header (unit number + status/type), a "Details" {@link FormSection} with an
 * attribute grid, and vehicles / pets / history as sections of rich {@link EntityCard}s. Each data
 * block has its own loading/empty/error state via the shared {@link AsyncBoundary}. The per-unit
 * vehicle/pet reads are resident self-scoped server-side (Req 66.3).
 */
export function UnitDetailView({ resources, unitId, initialUnit, showHistory = true }: UnitDetailViewProps) {
  const unit = useAsync<Unit>(
    (signal) => (initialUnit ? Promise.resolve(initialUnit) : resources.units.get(unitId, { signal })),
    [unitId, initialUnit],
  );
  const household = useAsync<UnitHouseholdMember[]>((signal) => resources.units.listHousehold(unitId, { signal }), [unitId]);
  const vehicles = useAsync<Vehicle[]>((signal) => resources.units.listVehicles(unitId, { signal }), [unitId]);
  const pets = useAsync<Pet[]>((signal) => resources.units.listPets(unitId, { signal }), [unitId]);
  const history = useAsync<UnitHistory | null>(
    (signal) => (showHistory ? resources.units.history(unitId, { signal }) : Promise.resolve(null)),
    [unitId, showHistory],
  );

  const u = unit.data;

  return (
    <View style={styles.stack}>
      <AsyncBoundary loading={unit.loading} error={unit.error} onRetry={unit.reload}>
        {u ? (
          <>
            {/* Hero header */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="home" size={26} color={theme.color.primaryText} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Unit {u.unitNumber}</Text>
                <View style={styles.heroBadges}>
                  <Badge label={humanizeCode(u.unitStatus)} tone={unitStatusTone(u.unitStatus)} />
                  <Badge label={humanizeCode(u.unitType)} tone="neutral" />
                </View>
              </View>
            </View>

            {/* Details */}
            <FormSection title="Details" icon="information-circle" tint={theme.color.info}>
              <View style={styles.attrGrid}>
                <Attr icon="layers-outline" label="Floor" value={u.floor ?? '—'} />
                <Attr icon="bed-outline" label="Bedrooms" value={u.bedrooms != null ? String(u.bedrooms) : '—'} />
                <Attr icon="resize-outline" label="Area" value={u.area != null ? `${u.area}` : '—'} />
              </View>
              {Object.entries(u.customAttributes).length > 0 ? (
                <View style={styles.attrGrid}>
                  {Object.entries(u.customAttributes).map(([k, v]) => (
                    <Attr key={k} icon="pricetag-outline" label={humanizeCode(k)} value={v} />
                  ))}
                </View>
              ) : null}
            </FormSection>
          </>
        ) : null}
      </AsyncBoundary>

      <FormSection
        title="Household"
        subtitle={(household.data?.length ?? 0) > 0 ? `${household.data!.length} member${household.data!.length === 1 ? '' : 's'}` : undefined}
        icon="people"
        tint={theme.color.info}
      >
        <AsyncBoundary
          loading={household.loading}
          error={household.error}
          empty={!household.loading && (household.data?.length ?? 0) === 0}
          emptyMessage="No household members yet."
          onRetry={household.reload}
        >
          <View style={styles.group}>
            {(household.data ?? []).map((m) => (
              <EntityCard
                key={m.residentId}
                title={m.name}
                subtitle={humanizeCode(m.relationship)}
                icon={m.residentType === 'owner' ? 'key' : 'person'}
                tint={m.residentType === 'owner' ? theme.color.success : theme.color.info}
                badge={{ label: humanizeCode(m.residentType), tone: m.residentType === 'owner' ? 'positive' : 'neutral' }}
              />
            ))}
          </View>
        </AsyncBoundary>
      </FormSection>

      <FormSection title="Vehicles" icon="car-sport" tint="#cf5500">
        <AsyncBoundary
          loading={vehicles.loading}
          error={vehicles.error}
          empty={!vehicles.loading && (vehicles.data?.length ?? 0) === 0}
          emptyMessage="No vehicles registered."
          onRetry={vehicles.reload}
        >
          <View style={styles.group}>
            {(vehicles.data ?? []).map((v) => (
              <EntityCard key={v.id} title={v.registrationNumber} subtitle={humanizeCode(v.vehicleType)} icon="car-sport" tint="#cf5500" />
            ))}
          </View>
        </AsyncBoundary>
      </FormSection>

      <FormSection title="Pets" icon="paw" tint="#8250df">
        <AsyncBoundary
          loading={pets.loading}
          error={pets.error}
          empty={!pets.loading && (pets.data?.length ?? 0) === 0}
          emptyMessage="No pets registered."
          onRetry={pets.reload}
        >
          <View style={styles.group}>
            {(pets.data ?? []).map((p) => (
              <EntityCard key={p.id} title={p.name ?? humanizeCode(p.petType)} subtitle={humanizeCode(p.petType)} icon="paw" tint="#8250df" />
            ))}
          </View>
        </AsyncBoundary>
      </FormSection>

      {showHistory ? (
        <FormSection title="History" icon="time" tint={theme.color.primary}>
          <AsyncBoundary
            loading={history.loading}
            error={history.error}
            empty={
              !history.loading &&
              (history.data?.ownership.length ?? 0) === 0 &&
              (history.data?.tenancy.length ?? 0) === 0
            }
            emptyMessage="No ownership or tenancy history."
            onRetry={history.reload}
          >
            <View style={styles.group}>
              {(history.data?.ownership ?? []).map((o) => (
                <EntityCard
                  key={`own-${o.id}`}
                  title="Owner"
                  subtitle={`${formatDate(o.startDate)} – ${o.endDate ? formatDate(o.endDate) : 'present'}`}
                  icon="key"
                  tint={theme.color.success}
                  {...(o.endDate ? {} : { badge: { label: 'Current', tone: 'positive' as const } })}
                />
              ))}
              {(history.data?.tenancy ?? []).map((t) => (
                <EntityCard
                  key={`ten-${t.id}`}
                  title="Tenant"
                  subtitle={`${formatDate(t.startDate)} – ${t.endDate ? formatDate(t.endDate) : 'present'}`}
                  icon="people"
                  tint={theme.color.info}
                  {...(t.endDate ? {} : { badge: { label: 'Active', tone: 'positive' as const } })}
                />
              ))}
            </View>
          </AsyncBoundary>
        </FormSection>
      ) : null}
    </View>
  );
}

function Attr({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.attr} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.attrIcon}>
        <Ionicons name={icon} size={16} color={theme.color.mutedText} />
      </View>
      <Text style={styles.attrLabel}>{label}</Text>
      <Text style={styles.attrValue}>{value}</Text>
    </View>
  );
}

/** Format an ISO date for display; falls back to the raw value if it can't be parsed. */
function formatDate(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing.md },
  group: { gap: theme.spacing.sm },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.hero,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadow.hero,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.onHeroSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, gap: theme.spacing.sm },
  heroTitle: { fontSize: theme.fontSize.heading, fontWeight: '800', color: theme.color.primaryText },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  attrGrid: { gap: theme.spacing.sm },
  attr: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  attrIcon: { width: 24, alignItems: 'center' },
  attrLabel: { flex: 1, fontSize: theme.fontSize.label, color: theme.color.mutedText },
  attrValue: { fontSize: theme.fontSize.body, color: theme.color.text, fontWeight: '700' },
});
