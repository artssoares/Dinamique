import { Linking, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import {
  EMERGENCY_NUMBER,
  SOS_GUIDANCE,
  formatApproxDistance,
  formatRemaining,
  alertRemainingSeconds,
  mapLink,
} from '@dinamique/business-logic';
import { Badge, Button, Card, Gradient, Icon, Text, useTheme } from '@dinamique/ui';
import { callEmergency } from './SosFlow';
import type { IncomingAlert } from './useSafety';

/**
 * O alerta como ele chega para os outros motoristas.
 *
 * O que está aqui, e nesta ordem: a distância aproximada, onde é, o carro, e a
 * orientação. O que NÃO está aqui, em nenhuma variação: um botão de "ir até o
 * local", uma rota, um "ajudar", um contato direto com quem pediu socorro.
 * Isso não é uma omissão a ser corrigida depois: é a funcionalidade. Um
 * aplicativo que manda motoristas para o lugar de onde alguém está pedindo
 * socorro cria uma segunda vítima, e a única ação útil que um terceiro tem é a
 * que o cartão oferece: ligar 190 e dizer onde é.
 *
 * Da placa, três letras. Da posição, distância arredondada em passos grossos.
 * O suficiente para reconhecer o carro se ele passar; não o suficiente para
 * identificar o dono.
 */

export function IncomingAlertCard({
  alert,
  /** Exemplo da tela de configuração: mesma peça, com um selo dizendo o que é. */
  sample = false,
}: {
  alert: IncomingAlert;
  sample?: boolean;
}) {
  const theme = useTheme();
  const remaining = alertRemainingSeconds(alert.expiresAt);

  const car = [alert.vehicleLabel, alert.vehicleColour].filter(Boolean).join(' · ');

  return (
    <Card
      padding="lg"
      style={{
        gap: theme.spacing.md,
        // A mesma borda lateral que a notificação não lida usa, no tom de
        // alerta. Estado nunca é dito só pela cor: o selo diz junto.
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.danger,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Badge label={sample ? 'Exemplo' : 'Socorro'} tone={sample ? 'neutral' : 'danger'} />
        <View style={{ flex: 1 }} />
        <Text variant="caption" color="muted">
          {remaining > 0 ? formatRemaining(remaining) : 'encerrado'}
        </Text>
      </View>

      <Text variant="subtitle">
        {alert.distanceM === null
          ? 'Um motorista perto de você pediu socorro'
          : `Um motorista a ${formatApproxDistance(alert.distanceM)} pediu socorro`}
      </Text>

      <AlertLocator lat={alert.lat} lon={alert.lon} />

      {car.length > 0 || alert.platePrefix ? (
        <View style={{ gap: theme.spacing.xs }}>
          {car.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Icon name="car" size={16} color={theme.colors.textSecondary} />
              <Text variant="body" color="secondary">
                {car}
              </Text>
            </View>
          ) : null}
          {alert.platePrefix ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Icon name="receipt" size={16} color={theme.colors.textSecondary} />
              <Text variant="body" color="secondary">
                Placa {alert.platePrefix}
                {/* As três letras são o que existe. O resto não foi guardado. */}
                <Text variant="body" color="muted">
                  {' '}
                  (só as três primeiras letras)
                </Text>
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Texto fixo, palavra por palavra, vindo de uma constante testada. */}
      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.dangerSubtle,
        }}
      >
        <Icon name="alert" size={17} color={theme.colors.dangerText} />
        <Text variant="captionStrong" color="danger" style={{ flex: 1 }}>
          {SOS_GUIDANCE}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={`Ligar ${EMERGENCY_NUMBER}`}
          variant="danger"
          iconName="phone"
          fullWidth
          onPress={() => void callEmergency()}
        />
        {alert.lat !== null && alert.lon !== null ? (
          // Abrir no mapa do próprio celular, e não um mapa navegável aqui
          // dentro: o que o 190 precisa ouvir é o nome da rua, e é isso que o
          // mapa do aparelho responde. Um mapa com rota até o ponto seria o
          // convite que o cartão existe para não fazer.
          <Button
            label="Ver o endereço no mapa"
            variant="ghost"
            iconName="compass"
            fullWidth
            onPress={() => {
              void Linking.openURL(mapLink(alert.lat!, alert.lon!)).catch(() => undefined);
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * O painel de localização.
 *
 * Um ponto sobre o gradiente da marca, com os anéis de distância em volta,
 * o mesmo desenho que o filme da jornada usa quando não há mapa. É deliberado
 * que não seja um mapa de ruas: o cartão mostra ONDE é para quem vai ligar
 * 190, não para quem vai até lá, e as coordenadas ficam a um toque no mapa do
 * aparelho para quem precisar do nome da rua.
 */
function AlertLocator({ lat, lon }: { lat: number | null; lon: number | null }) {
  const theme = useTheme();
  const height = 128;

  if (lat === null || lon === null) {
    return (
      <View
        style={{
          height: 64,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.backgroundSecondary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="caption" color="muted">
          Sem localização neste alerta
        </Text>
      </View>
    );
  }

  return (
    <Gradient
      colors={[theme.colors.heroFrom, theme.colors.heroTo]}
      radius={theme.radius.xl}
      style={{ height, justifyContent: 'flex-end', padding: theme.spacing.md }}
    >
      <Svg width="100%" height={height} style={{ position: 'absolute' }}>
        {[46, 32, 18].map((r) => (
          <Circle
            key={r}
            cx="50%"
            cy={height / 2}
            r={r}
            stroke={theme.colors.textOnInverse}
            strokeOpacity={0.22}
            strokeWidth={1}
            fill="none"
          />
        ))}
        <Line
          x1="50%"
          y1={height / 2 - 56}
          x2="50%"
          y2={height / 2 + 56}
          stroke={theme.colors.textOnInverse}
          strokeOpacity={0.14}
          strokeWidth={1}
        />
        <Circle cx="50%" cy={height / 2} r={7} fill={theme.colors.danger} />
      </Svg>

      <Text variant="caption" style={{ color: theme.colors.textOnInverse }}>
        {lat.toFixed(4)}, {lon.toFixed(4)}
      </Text>
    </Gradient>
  );
}
