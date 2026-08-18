import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Text, useTheme } from '@dinamique/ui';

/** O usuário desistiu no meio do checkout. Nada foi cobrado. */
export default function CheckoutCancelled() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Assinatura' }} />
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center', gap: theme.spacing.lg }}>
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <Text variant="titleLg">Pagamento não concluído</Text>
          <Text variant="body" color="secondary">
            Nada foi cobrado. Você continua no plano Free e pode assinar quando quiser.
          </Text>
        </Card>

        <Button label="Ver os planos" size="lg" fullWidth onPress={() => router.replace('/plan')} />
        <Button label="Continuar no Free" variant="ghost" fullWidth onPress={() => router.replace('/(tabs)')} />
      </View>
    </>
  );
}
