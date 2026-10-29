import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { ListRow } from '@/components/ui/ListRow';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/LinkButton';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { CustodyTimelineEntry, Parcel } from '@/types/parcel';
import type { ResourceClients } from '@/services/resources';
import { parcelStatusTone, humanizeCode } from '@/utils/status';

export interface ParcelTimelineScreenProps {
  resources: ResourceClients;
  parcel: Parcel;
  onBack?: () => void;
}

/**
 * Resident custody timeline (Req 31.5). Shows the chronological append-only custody events for one
 * parcel — registered / status changes / custody assigned / handed over / lost-damaged / returned /
 * SLA escalation — so the resident can see exactly where their parcel is and what happened to it.
 * The entries are secret-free by construction server-side; the screen just renders them in order.
 */
export function ParcelTimelineScreen({ resources, parcel, onBack }: ParcelTimelineScreenProps) {
  const { data, loading, error, reload } = useAsync<CustodyTimelineEntry[]>(
    (signal) => resources.parcels.getCustodyTimeline(parcel.id, { signal }),
    [parcel.id],
  );

  const entries = data ?? [];

  return (
    <Screen accessibilityLabel="Parcel custody timeline">
      {onBack ? <LinkButton title="‹ Back" onPress={onBack} accessibilityHint="Return to the parcel list" /> : null}
      <SectionHeading title="Custody timeline" level={1} />

      <ListRow
        title={parcel.trackingNumber}
        subtitle={`${parcel.provider} · ${humanizeCode(parcel.category)}`}
        trailing={<Badge label={humanizeCode(parcel.status)} tone={parcelStatusTone(parcel.status)} />}
      />

      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && entries.length === 0}
        emptyMessage="No custody events recorded yet."
        onRetry={reload}
      >
        <View style={styles.list}>
          {entries.map((e) => (
            <ListRow
              key={e.id}
              title={describeEvent(e)}
              subtitle={`${formatDateTime(e.occurredAtUtc)}${e.detail ? ` · ${e.detail}` : ''}`}
            />
          ))}
        </View>
      </AsyncBoundary>
    </Screen>
  );
}

/** A readable one-line description of a timeline event, including the status change when present. */
function describeEvent(e: CustodyTimelineEntry): string {
  const label = humanizeCode(e.eventType);
  if (e.fromStatus && e.toStatus) {
    return `${label}: ${humanizeCode(e.fromStatus)} → ${humanizeCode(e.toStatus)}`;
  }
  if (e.toStatus) {
    return `${label}: ${humanizeCode(e.toStatus)}`;
  }
  return label;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});
