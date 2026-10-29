import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { AppButton } from './AppButton';

export interface PagerProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/**
 * Previous/next pager for the paginated list screens (Req 9.3). Shows the current range and total,
 * disables the ends, and announces the position for assistive tech. Reused so no list screen
 * hand-rolls paging controls. Renders nothing when everything fits on one page.
 */
export function Pager({ page, pageSize, totalCount, onPageChange, disabled = false }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  if (totalPages <= 1) {
    return null;
  }
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;

  return (
    <View style={styles.row}>
      <AppButton
        title="Previous"
        variant="secondary"
        disabled={!canPrev}
        onPress={() => onPageChange(page - 1)}
        accessibilityHint="Go to the previous page"
      />
      <Text style={styles.status} accessibilityLiveRegion="polite">
        {from}–{to} of {totalCount}
      </Text>
      <AppButton
        title="Next"
        variant="secondary"
        disabled={!canNext}
        onPress={() => onPageChange(page + 1)}
        accessibilityHint="Go to the next page"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  status: { fontSize: theme.fontSize.label, color: theme.color.mutedText, flexShrink: 1, textAlign: 'center' },
});
