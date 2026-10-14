import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../../ui/FormScreen';
import { FormSection } from '../../ui/FormSection';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { EntityCard } from '../../ui/EntityCard';
import { Badge } from '../../ui/Badge';
import { useAsync } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import type { EmergencyContact } from '../../models/resident';
import type { ResourceClients } from '../../resources';
import { verificationTone, humanizeCode } from '../shared/status';
import { UnitDetailView } from '../shared/UnitDetailView';
import { useMyResident } from './useMyResident';

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
            {/* Banner + overlapping identity card (consistent with the Profile tab redesign). */}
            <View style={styles.banner}>
              <View style={styles.bannerBlobA} />
              <View style={styles.bannerBlobB} />
            </View>
            <View style={styles.identityWrap}>
              <View style={styles.avatarClay}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>{initialsOf(resident.name)}</Text>
                </View>
              </View>
              <View style={styles.identityCard}>
                <Text style={styles.name} numberOfLines={1}>{resident.name}</Text>
                <View style={styles.heroBadges}>
                  <Badge label={humanizeCode(resident.residentType)} tone="neutral" />
                  <Badge label={humanizeCode(resident.verificationStatus)} tone={verificationTone(resident.verificationStatus)} />
                </View>

                {/* Contact rows inside the card (replaces the dark hero chips). */}
                {(resident.phone || resident.email) ? (
                  <View style={styles.contactRows}>
                    {resident.phone ? <ContactLine icon="call-outline" label={resident.phone} tint={theme.color.success} /> : null}
                    {resident.email ? <ContactLine icon="mail-outline" label={resident.email} tint={theme.color.info} /> : null}
                  </View>
                ) : null}

                {/* Inline stat tiles: resident type · verification · units count. */}
                <View style={styles.statRow}>
                  <StatTile icon="people" value={humanizeCode(resident.residentType)} label="Type" tint={theme.color.primary} />
                  <StatTile icon="shield-checkmark" value={humanizeCode(resident.verificationStatus)} label="Status" tint={verificationTone(resident.verificationStatus) === 'positive' ? theme.color.success : theme.color.warning} />
                  <StatTile icon="home" value={String(myUnits.length)} label={myUnits.length === 1 ? 'Unit' : 'Units'} tint={theme.color.info} />
                </View>
              </View>
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
                <UnitDetailView key={u.unitId} resources={resources} unitId={u.unitId} showHistory={false} />
              ))}
            </View>
          </AsyncBoundary>
        </>
      ) : null}
    </FormScreen>
  );
}

/** A contact line inside the identity card: tinted icon tile + value. */
function ContactLine({ icon, label, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string }) {
  return (
    <View style={styles.contactLine}>
      <View style={[styles.contactIcon, { backgroundColor: `${tint}1f` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <Text style={styles.contactText} numberOfLines={1}>{label}</Text>
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
  // Banner + overlapping identity card (matches the Profile tab language).
  banner: {
    height: 120,
    backgroundColor: theme.color.hero,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  bannerBlobA: {
    position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: 75,
    backgroundColor: theme.color.heroAlt, opacity: 0.9,
  },
  bannerBlobB: {
    position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: 60,
    backgroundColor: theme.color.primary, opacity: 0.25,
  },
  identityWrap: { marginTop: -60, alignItems: 'center' },
  avatarClay: {
    width: 96, height: 96, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#0b1726', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 8,
  },
  avatar: {
    width: 80, height: 80, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.primary },
  identityCard: {
    marginTop: -48, width: '100%',
    backgroundColor: theme.color.surface, borderRadius: theme.radius.xl,
    paddingTop: 56, paddingBottom: theme.spacing.lg, paddingHorizontal: theme.spacing.lg,
    alignItems: 'center', gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  name: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm },
  contactRows: { alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  contactIcon: { width: 32, height: 32, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  contactText: { flex: 1, fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  statRow: {
    flexDirection: 'row', alignSelf: 'stretch', gap: theme.spacing.sm,
    marginTop: theme.spacing.md, paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.border,
  },
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
