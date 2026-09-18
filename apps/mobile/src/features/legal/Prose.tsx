import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from '@dinamique/ui';

/**
 * Texto corrido para os documentos legais.
 *
 * Uma política de privacidade que ninguém lê não protege ninguém, então aqui o
 * texto tem a mesma largura de leitura e o mesmo respiro do resto do aplicativo
 * em vez do bloco denso de sempre.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subtitle">{title}</Text>
      {children}
    </View>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <Text variant="body" color="secondary">
      {children}
    </Text>
  );
}

export function Bullets({ items }: { items: string[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Text variant="body" color="muted">
            •
          </Text>
          <Text variant="body" color="secondary" style={{ flex: 1 }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}
