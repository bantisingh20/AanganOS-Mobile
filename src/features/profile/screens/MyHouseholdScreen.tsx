import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { EntityCard } from '@/components/ui/EntityCard';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { EmergencyContact } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';
import { verificationTone, humanizeCode } from '@/utils/status';
import { MyUnitCard } from '@/features/profile/components/MyUnitCard';
import { useMyResident } from '@/features/profile/hooks/useMyResident';

export interface MyHouseholdScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Two-letter initials for the avatar. */
function initialsOf(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Resident self-view (Req 19.5, 66.3) — a modern, card-based layout: a profile hero (avatar, name,
 * type, verification badge, contact chips), emergency contacts as a {@link FormSection}, and the
 * resident's unit(s) with their household/vehicles/pets via the shared {@link UnitDetailView}.
 * Everything is self-scoped server-side (the API returns only the signed-in resident's own rows).
 */
export function MyHouseholdScreen({ resources, onBack }: MyHouseholdScreenProps) {
  // "Who am I" + my units in ONE self-targeted call (GET /residents/me). The resident is already
  // matched by the token's user id server-side, so a non-resident principal (superadmin) gets a null
  // resident and sees the empty state rather than a stranger's household.
  const me = useMyResident(resources);
  const resident = me.data?.resident ?? null;
  const myUnits = me.data?.units ?? [];

  return (
    <FormScreen title="My household" subtitle="Your profile, contacts & units" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={me.loading}
        error={me.error}
        empty={!me.loading && resident === null}
        emptyMessage="We couldn't find a resident profile linked to your account."
        onRetry={me.reload}
      >
        {resident ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroBlobA} />
              <View style={styles.heroBlobB} />
              <View style={styles.heroRing} />

              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>{initialsOf(resident.name)}</Text>
                </View>
              </View>

              <Text style={styles.heroName} numberOfLines={1}>{resident.name}</Text>

              <View style={styles.heroBadges}>
                <View style={styles.heroPill}>
                  <Ionicons name="person" size={12} color={theme.color.primaryText} />
                  <Text style={styles.heroPillText}>{humanizeCode(resident.residentType)}</Text>
                </View>
                <View style={styles.heroPill}>
                  <Ionicons name="shield-checkmark" size={12} color={theme.color.primaryText} />
                  <Text style={styles.heroPillText}>{humanizeCode(resident.verificationStatus)}</Text>
                </View>
              </View>

              {(resident.phone || resident.email) ? (
                <View style={styles.heroContacts}>
                  {resident.phone ? <HeroContact icon="call" label={resident.phone} /> : null}
                  {resident.email ? <HeroContact icon="mail" label={resident.email} /> : null}
                </View>
              ) : null}
            </View>

            <View style={styles.statCard}>
              <StatTile icon="people" value={humanizeCode(resident.residentType)} label="Type" tint={theme.color.primary} />
              <View style={styles.statSep} />
              <StatTile icon="shield-checkmark" value={humanizeCode(resident.verificationStatus)} label="Status" tint={verificationTone(resident.verificationStatus) === 'positive' ? theme.color.success : theme.color.warning} />
              <View style={styles.statSep} />
              <StatTile icon="home" value={String(myUnits.length)} label={myUnits.length === 1 ? 'Unit' : 'Units'} tint={theme.color.info} />
            </View>

            <EmergencyContacts resources={resources} residentId={resident.id} />
          </>
        ) : null}
      </AsyncBoundary>

      {/* Units — only for an actual resident principal (a non-resident's units.list() would return
          the whole community, not "my units"). The shared UnitDetailView renders its own hero +
          section cards per unit, so this is a plain section header (avoids a card-in-card look). */}
      {resident ? (
        <>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: `${theme.color.info}1f` }]}>
              <Ionicons name="home" size={16} color={theme.color.info} />
            </View>
            <Text style={styles.sectionTitle}>My units</Text>
            {myUnits.length > 0 ? <Text style={styles.sectionCount}>{myUnits.length}</Text> : null}
          </View>
          <AsyncBoundary
            loading={me.loading}
            error={me.error}
            empty={!me.loading && myUnits.length === 0}
            emptyMessage="No units are associated with your household yet."
            onRetry={me.reload}
          >
            <View style={styles.units}>
              {myUnits.map((u) => (
                <MyUnitCard key={u.unitId} resources={resources} unitId={u.unitId} />
              ))}
            </View>
          </AsyncBoundary>
        </>
      ) : null}
    </FormScreen>
  );
}

/** A translucent contact chip on the hero. */
function HeroContact({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.heroContactChip}>
      <Ionicons name={icon} size={14} color={theme.color.primaryText} />
      <Text style={styles.heroContactText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** One inline stat tile in the identity card (type / status / units). */
function StatTile({ icon, value, label, tint }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tint: string }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** The resident's emergency contacts (Req 15.3), self-scoped. */
function EmergencyContacts({ resources, residentId }: { resources: ResourceClients; residentId: string }) {
  const contacts = useAsync<EmergencyContact[]>(
    (signal) => resources.residents.listEmergencyContacts(residentId, { signal }),
    [residentId],
  );
  const list = contacts.data ?? [];
  return (
    <FormSection
      title="Emergency contacts"
      subtitle={list.length > 0 ? `${list.length} contact${list.length === 1 ? '' : 's'}` : undefined}
      icon="call"
      tint={theme.color.success}
    >
      <AsyncBoundary
        loading={contacts.loading}
        error={contacts.error}
        empty={!contacts.loading && list.length === 0}
        emptyMessage="No emergency contacts on file."
        onRetry={contacts.reload}
      >
        <View style={styles.contactList}>
          {list.map((c) => (
            <EntityCard
              key={c.id}
              title={c.name}
              subtitle={`${humanizeCode(c.relationship)} · ${c.phone}`}
              icon="person"
              tint={theme.color.success}
            />
          ))}
        </View>
      </AsyncBoundary>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.color.hero,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
    overflow: 'hidden',
    ...theme.shadow.hero,
  },
  heroBlobA: {
    position: 'absolute', top: -50, right: -40, width: 170, height: 170, borderRadius: 85,
    backgroundColor: theme.color.heroAlt, opacity: 0.9,
  },
  heroBlobB: {
    position: 'absolute', bottom: -60, left: -30, width: 140, height: 140, borderRadius: 70,
    backgroundColor: theme.color.primary, opacity: 0.22,
  },
  heroRing: {
    position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarRing: {
    width: 92, height: 92, borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatar: {
    width: 72, height: 72, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.primary },
  heroName: { fontSize: theme.fontSize.heading, fontWeight: '800', color: theme.color.primaryText, textAlign: 'center' },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.color.onHeroSoft,
    paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill,
  },
  heroPillText: { color: theme.color.primaryText, fontSize: theme.fontSize.caption, fontWeight: '700' },
  heroContacts: { alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  heroContactChip: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.color.onHeroSoft,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md,
  },
  heroContactText: { flex: 1, color: theme.color.primaryText, fontSize: theme.fontSize.label, fontWeight: '600' },
  statCard: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: -theme.spacing.lg, marginHorizontal: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm,
    ...theme.shadow.card,
  },
  statSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 4, backgroundColor: theme.color.border },
  statTile: { flex: 1, alignItems: 'center', gap: 4 },
  statIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  statLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  contactList: { gap: theme.spacing.sm },
  units: { gap: theme.spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  sectionIcon: { width: 28, height: 28, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  sectionCount: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '700' },
});
