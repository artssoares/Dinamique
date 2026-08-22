import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';

/**
 * Retorno do checkout.
 *
 * "Voltou do Stripe" não é o mesmo que "pagamento confirmado" – quem confirma
 * é o webhook, e ele pode levar alguns segundos. Por isso a tela recarrega o
 * plano algumas vezes e, se ainda não chegou, diz a verdade em vez de fingir.
 */
export default function CheckoutSuccess() {
  const theme = useTheme();
  const router = useRouter();
  const { plan, refresh } = useSession();
  const [attempts, setAttempts] = useState(0);

  const confirmed = plan === 'pro';

  useEffect(() => {
    if (confirmed || attempts >= 5) return;

    const timer = setTimeout(async () => {
      await refresh();
      setAttempts((current) => current + 1);
    }, 1500);

    return () => clearTimeout(timer);
  }, [attempts, confirmed, refresh]);

  const stillWaiting = !confirmed && attempts < 5;

  return (
    <Screen
      header={<ScreenHeader title="Assinatura" onBack={() => router.back()} />}
      center
      gap="lg"
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          {confirmed ? (
            <>
              <Text variant="titleLg">Tudo certo</Text>
              <Text variant="body" color="secondary">
                Sua assinatura está ativa. Todos os recursos do Pro já estão liberados.
              </Text>
            </>
          ) : stillWaiting ? (
            <>
              <Text variant="titleLg">Confirmando seu pagamento</Text>
              <Text variant="body" color="secondary">
                Isso costuma levar alguns segundos.
              </Text>
            </>
          ) : (
            <>
              <Text variant="titleLg">Pagamento em processamento</Text>
              <Text variant="body" color="secondary">
                Recebemos seu pagamento, mas a confirmação ainda não chegou até nós. Ela costuma
                levar poucos minutos e você não precisa pagar de novo. Se demorar mais que isso,
                fale com o suporte.
              </Text>
            </>
          )}
        </Card>

        <Button
          label={confirmed ? 'Começar a usar' : 'Voltar'}
          size="lg"
          fullWidth
          onPress={() => router.replace(confirmed ? '/(tabs)' : '/plan')}
        />

        {!confirmed && !stillWaiting ? (
          <Button
            label="Falar com o suporte"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/support/new')}
          />
        ) : null}
      </View>
    </Screen>
  );
}
