import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';

/** O usuário desistiu no meio do checkout. Nada foi cobrado. */
export default function CheckoutCancelled() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      header={<ScreenHeader title="Assinatura" onBack={() => router.back()} />}
      center
      gap="lg"
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <Text variant="titleLg">Pagamento não concluído</Text>
          <Text variant="body" color="secondary">
            Nada foi cobrado. Você continua no plano Free e pode assinar quando quiser.
          </Text>
        </Card>

        <Button label="Ver os planos" size="lg" fullWidth onPress={() => router.replace('/plan')} />
        <Button label="Continuar no Free" variant="ghost" fullWidth onPress={() => router.replace('/(tabs)')} />
      </View>
    </Screen>
  );
}
