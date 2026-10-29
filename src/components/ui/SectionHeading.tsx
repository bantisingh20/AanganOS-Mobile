import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export interface SectionHeadingProps {
  title: string;
  /** Optional right-aligned slot (e.g. a count or action link). */
  trailing?: React.ReactNode;
  /** Heading level for assistive tech (1 = screen title, 2 = section). Defaults to 2. */
  level?: 1 | 2;
  testID?: string;
}

/** Consistent, accessible section/screen heading reused across the Phase 2 screens (Req 65.6). */
export function SectionHeading({ title, trailing, level = 2, testID }: SectionHeadingProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text
        style={level === 1 ? styles.title : styles.section}
        accessibilityRole="header"
        aria-level={level}
      >
        {title}
      </Text>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  title: { fontSize: theme.fontSize.title, fontWeight: '700', color: theme.color.text },
  section: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
});
