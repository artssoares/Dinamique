import { Tabs } from 'expo-router';
import { TabBar } from '@/features/navigation/TabBar';
import { useNotificationCounts } from '@/hooks/useNotifications';

/**
 * Five destinations, with the most frequent action – recording something – in
 * the centre where a thumb naturally lands (§21).
 *
 * The bar itself is `TabBar`: a floating pill that sits above the content
 * rather than a strip pinned to the bottom edge. Screens inside this group
 * pass `tabBarSpacing` to <Screen> so their last card is not hidden under it.
 */
export default function TabsLayout() {
  const { unreadTotal } = useNotificationCounts();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <TabBar {...props} badge={unreadTotal} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoje' }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico' }} />
      <Tabs.Screen name="record" options={{ title: 'Registrar' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="more" options={{ title: 'Mais' }} />
    </Tabs>
  );
}
