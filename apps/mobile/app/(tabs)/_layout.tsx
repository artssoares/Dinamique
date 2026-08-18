import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Text, useTheme } from '@dinamique/ui';
import { useNotificationCounts } from '@/hooks/useNotifications';

/**
 * Five destinations, with the most frequent action — recording something —
 * in the centre where a thumb naturally lands (§21).
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { unreadTotal } = useNotificationCounts();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandPrimary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surfacePrimary,
          borderTopColor: theme.colors.borderSubtle,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Hoje', tabBarIcon: ({ color }: { color: string }) => <TabGlyph label="◎" color={color} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Histórico', tabBarIcon: ({ color }: { color: string }) => <TabGlyph label="▤" color={color} /> }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '',
          tabBarIcon: () => <CentreAction />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: ({ color }: { color: string }) => <TabGlyph label="◈" color={color} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Mais',
          tabBarIcon: ({ color }: { color: string }) => <TabGlyph label="⋯" color={color} />,
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
        }}
      />
    </Tabs>
  );
}

/**
 * Glyphs stand in for the icon set. They are placeholders with the right
 * geometry, not a finished icon language — see MOBILE.md.
 */
function TabGlyph({ label, color }: { label: string; color: string }) {
  return <Text variant="subtitle" style={{ color }}>{label}</Text>;
}

function CentreAction() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 52,
        height: 52,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.brandPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -18,
        ...theme.elevation.md,
      }}
    >
      <Text variant="titleLg" color="onBrand">
        +
      </Text>
    </View>
  );
}
