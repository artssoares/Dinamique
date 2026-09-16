import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EMERGENCY_NUMBER, SOS_RADIUS_M } from '@dinamique/business-logic';
import { Card, EmptyState, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useSafety } from '@/features/safety/useSafety';
import { canReceiveWhileClosed } from '@/features/safety/position';
import { IncomingAlertCard } from '@/features/safety/IncomingAlertCard';

/**
 * Os alertas que chegaram até aqui.
 *
 * É o destino do link da notificação (`/sos/received`) e da badge no botão do
 * cabeçalho. Só alertas ATIVOS aparecem: um alerta encerrado deixa de ser
 * legível no próprio banco, e é isso que a tela de consentimento promete.
 */
export default function ReceivedAlerts() {
  const theme = useTheme();
  const router = useRouter();
  const { incoming, prefs, consented, refresh } = useSafety();
  const [refreshing, setRefreshing] = useState(false);

  // Contado uma vez por abertura da tela, não por cartão: o que interessa é
  // "quantas pessoas leram um alerta", não quantas vezes a lista repintou.
  useEffect(() => {
    if (incoming.length > 0) void track('sos_alert_received', { count: incoming.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming.length > 0]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <Screen
      header={<ScreenHeader title="Alertas recebidos" onBack={() => router.back()} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      gap="lg"
      grow
    >
      {incoming.map((alert) => (
        <IncomingAlertCard key={alert.id} alert={alert} />
      ))}

      {incoming.length === 0 ? (
        <EmptyState
          iconName="shield"
          title="Nenhum alerta agora"
          description={
            consented && prefs.networkOptIn
              ? `Você está na rede. Se um motorista do Dinamique pedir socorro a menos de ${
                  SOS_RADIUS_M / 1000
                } km, o aviso aparece aqui.`
              : 'Você não está participando da rede de alertas, então não recebe avisos de outros motoristas.'
          }
          actionLabel={consented && prefs.networkOptIn ? undefined : 'Participar da rede'}
          onAction={
            consented && prefs.networkOptIn ? undefined : () => router.push('/sos')
          }
        />
      ) : null}

      {incoming.length > 0 ? (
        <Card padding="lg" style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong">O que fazer, e o que não fazer</Text>
          <Text variant="caption" color="secondary">
            Ligue {EMERGENCY_NUMBER} e informe a localização. Não vá até o local, não procure o
            carro e não tente abordar ninguém: quem chega junto vira a segunda vítima, e a polícia
            perde tempo com duas ocorrências em vez de uma.
          </Text>
        </Card>
      ) : null}

      {canReceiveWhileClosed ? null : (
        <View>
          <Text variant="caption" color="warning">
            Você está no navegador: um alerta novo aparece quando você abre esta tela, não como
            notificação do celular. Para receber com o aplicativo fechado, instale o Dinamique.
          </Text>
        </View>
      )}
    </Screen>
  );
}
