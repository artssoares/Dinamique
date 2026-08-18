import { View } from 'react-native';
import type { Insight } from '@dinamique/business-logic';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from './Card';
import { Text } from './Text';

export interface InsightCardProps {
  insight: Insight;
}

/**
 * An insight is a sentence, not a chart. The accent bar carries the tone so the
 * text itself stays readable rather than being colour-coded (§116).
 */
export function InsightCard({ insight }: InsightCardProps) {
  const theme = useTheme();

  const toneColor =
    insight.tone === 'positive'
      ? theme.colors.success
      : insight.tone === 'negative'
        ? theme.colors.warning
        : theme.colors.brandPrimary;

  return (
    <Card padding="lg" style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      <View
        style={{
          width: 4,
          borderRadius: theme.radius.pill,
          backgroundColor: toneColor,
        }}
      />
      <Text variant="body" style={{ flex: 1 }}>
        {insight.text}
      </Text>
    </Card>
  );
}
