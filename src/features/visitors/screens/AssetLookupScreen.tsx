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
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Asset } from '@/types/maintenance';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface AssetLookupScreenProps {
  resources: ResourceClients;
  /** Open the work orders for the picked asset (filtered by assetId). */
  onOpenWorkOrders?: (asset: Asset) => void;
  onBack?: () => void;
}

/**
 * Staff asset QR-token lookup (Req 35.2) — redesigned to the shared card style. The staff member
 * types/pastes the token on the asset's QR label (or the serial) and looks it up. A plain text field
 * + lookup (NO camera here — ponytail: the maintenance lookup never needed a scanner; a token/serial
 * field covers the same intent). The text drives the tenant-scoped asset `search` (name/serial/
 * location); an exact `qrToken` match in the page is surfaced first as the resolved asset, otherwise
 * the search matches are listed as **product-row cards** to pick from.
 *
 * <p>ponytail: naive client-side token match over one search page — fine for the bounded per-community
 * asset register; a server-side `qrToken` filter is the upgrade path if registers grow large.</p>
 */
export function AssetLookupScreen({ resources, onOpenWorkOrders, onBack }: AssetLookupScreenProps) {
  const [token, setToken] = useState('');
  const [query, setQuery] = useState('');

  const { data, loading, error, reload } = useAsync<PagedData<Asset>>(
    (signal) =>
      query.trim().length === 0
        ? Promise.resolve(emptyPage())
        : resources.maintenance.listAssets({ search: query.trim(), page: 1, pageSize: DEFAULT_PAGE_SIZE }, {}, { signal }),
    [query],
  );

  const items = data?.items ?? [];
  const trimmed = query.trim();
  // Exact QR-token match takes precedence over a plain name/serial search hit.
  const exact = trimmed.length ? items.find((a) => a.qrToken === trimmed) ?? null : null;
  const rest = exact ? items.filter((a) => a.id !== exact.id) : items;

  return (
    <FormScreen title="Find an asset" subtitle="Look up equipment by QR token or serial" {...(onBack ? { onBack } : {})}>
      <AppTextField
        label="QR token or serial"
        value={token}
        onChangeText={setToken}
        placeholder="Type / paste the asset QR token or serial"
        autoCapitalize="characters"
        returnKeyType="search"
        onSubmitEditing={() => setQuery(token)}
      />
      <AppButton
        title="Look up asset"
        disabled={token.trim().length === 0}
        onPress={() => setQuery(token)}
        accessibilityHint="Look up the asset by its QR token or serial"
      />

      {trimmed.length ? (
        <AsyncBoundary
          loading={loading}
          error={error}
          empty={!loading && items.length === 0}
          emptyMessage="No asset matches that token or serial."
          onRetry={reload}
        >
          {exact ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MATCHED ASSET</Text>
              <AssetCard asset={exact} matched onOpenWorkOrders={onOpenWorkOrders} />
            </View>
          ) : null}
          {rest.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{exact ? 'OTHER MATCHES' : 'MATCHES'}</Text>
              <View style={styles.list}>
                {rest.map((a) => (
                  <AssetCard key={a.id} asset={a} onOpenWorkOrders={onOpenWorkOrders} />
                ))}
              </View>
            </View>
          ) : null}
        </AsyncBoundary>
      ) : null}
    </FormScreen>
  );
}

function AssetCard({
  asset,
  matched = false,
  onOpenWorkOrders,
}: {
  asset: Asset;
  matched?: boolean;
  onOpenWorkOrders?: (asset: Asset) => void;
}) {
  return (
    <View style={[styles.card, matched ? styles.cardMatched : null]}>
      <View style={styles.cardTop}>
        <View style={[styles.iconTile, { backgroundColor: matched ? '#e6f4ea' : `${theme.color.info}1f` }]}>
          <Ionicons name="cube-outline" size={22} color={matched ? theme.color.success : theme.color.info} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{asset.name}</Text>
          <Text style={styles.cardSub} numberOfLines={2}>
            {asset.serialNumber} · {humanizeCode(asset.assetType)} · {asset.location}
          </Text>
        </View>
        <Badge
          label={matched ? 'Matched' : humanizeCode(asset.status)}
          tone={matched ? 'positive' : 'neutral'}
        />
      </View>
      {onOpenWorkOrders ? (
        <AppButton
          title="Work orders"
          variant="secondary"
          onPress={() => onOpenWorkOrders(asset)}
          accessibilityHint={`View work orders for ${asset.name}`}
        />
      ) : null}
    </View>
  );
}

function emptyPage(): PagedData<Asset> {
  return { items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, totalCount: 0 };
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  sectionLabel: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.mutedText, letterSpacing: 0.5 },
  list: { gap: theme.spacing.md },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardMatched: { borderWidth: 1, borderColor: theme.color.success },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
