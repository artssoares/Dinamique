import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EMERGENCY_NUMBER,
  MAX_EMERGENCY_CONTACTS,
  SOS_ALERT_TTL_MINUTES,
  SOS_COUNTDOWN_SECONDS,
  SOS_DAILY_LIMIT,
  SOS_HOLD_MS,
  SOS_MIN_INTERVAL_MINUTES,
  SOS_RADIUS_M,
} from '@dinamique/business-logic';
import {
  Button,
  Card,
  Icon,
  Notice,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  type IconName,
} from '@dinamique/ui';
import { useSafety } from '@/features/safety/useSafety';
import { canReceiveWhileClosed } from '@/features/safety/position';

/**
 * O consentimento, antes do primeiro uso.
 *
 * Sem o toque em "Aceitar e ativar" nesta tela, a função fica desligada, e não
 * é a tela que a mantém desligada: `sos_trigger` recusa o disparo enquanto
 * `sos_consent_at` for nulo, qualquer que seja o caminho até ele.
 *
 * O texto responde as três perguntas que a LGPD exige em ordem, e em português
 * de quem está lendo: QUAIS dados, com QUEM, por QUANTO tempo. Nenhuma delas
 * fica num link para outra página: "aceito os termos" não é consentimento
 * informado quando o que se informa está em outro lugar.
 */

interface Point {
  icon: IconName;
  title: string;
  body: string;
}

export default function SosConsent() {
  const theme = useTheme();
  const router = useRouter();
  const { consented, grantConsent, prefs, updatePrefs } = useSafety();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const shared: Point[] = [
    {
      icon: 'compass',
      title: 'Sua localização, só durante o alerta',
      body: `Quando você dispara, sua posição vai para os motoristas do Dinamique num raio de ${
        SOS_RADIUS_M / 1000
      } km e para os seus contatos de emergência. Ao encerrar (ou depois de ${SOS_ALERT_TTL_MINUTES} minutos, automaticamente) o compartilhamento para.`,
    },
    {
      icon: 'car',
      title: 'Seu carro, para te reconhecerem',
      body: 'Modelo, cor e SÓ as três primeiras letras da placa. A placa inteira não é guardada em lugar nenhum. Seu nome, seu telefone e seus números não vão para outros motoristas.',
    },
    {
      icon: 'phone',
      title: 'Seus contatos de emergência',
      body: `Até ${MAX_EMERGENCY_CONTACTS} pessoas que você cadastrar recebem sua localização quando o alerta é ativado. Ninguém mais, nem o suporte do Dinamique, consegue ler essa lista.`,
    },
    {
      icon: 'shield',
      title: 'Um registro de cada alerta',
      body: `Guardamos quem disparou, quando, onde e se foi cancelado. É o que permite apurar abuso, e é por isso que existe limite: ${SOS_DAILY_LIMIT} alertas por dia, um a cada ${SOS_MIN_INTERVAL_MINUTES} minutos.`,
    },
  ];

  const flow: Point[] = [
    {
      icon: 'clock',
      title: `Segurar por ${Math.round(SOS_HOLD_MS / 1000)} segundos`,
      body: 'O botão vermelho fica no alto da tela, ao lado do menu. Soltar antes cancela e nada acontece.',
    },
    {
      icon: 'alert',
      title: `${SOS_COUNTDOWN_SECONDS} segundos para desistir`,
      body: 'Depois de disparar, aparece uma contagem com um botão de cancelar. Alarme falso não custa nada.',
    },
    {
      icon: 'phone',
      title: `A ligação para o ${EMERGENCY_NUMBER}`,
      body: 'O aplicativo abre a discagem da polícia. Essa é a ação principal: os avisos aos outros motoristas são um complemento, nunca um substituto.',
    },
  ];

  async function accept() {
    setSaving(true);
    setFailed(false);
    const ok = await grantConsent();
    setSaving(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    router.replace('/sos');
  }

  return (
    <Screen
      header={<ScreenHeader title="Botão de emergência" onBack={() => router.back()} />}
      gap="lg"
    >
      <Card padding="xl" style={{ gap: theme.spacing.sm }}>
        <Text variant="titleLg">Para usar em caso de risco</Text>
        <Text variant="body" color="secondary">
          Você segura um botão por três segundos e o Dinamique abre a ligação para a polícia, avisa
          seus contatos de emergência e avisa os motoristas que estiverem por perto.
        </Text>
        <Text variant="caption" color="muted">
          Isto não substitui o {EMERGENCY_NUMBER}. Ele é a primeira coisa que o aplicativo faz.
        </Text>
      </Card>

      <Text variant="captionStrong" color="secondary">
        O QUE É COMPARTILHADO, COM QUEM E POR QUANTO TEMPO
      </Text>

      <Card padding="xl" style={{ gap: theme.spacing.lg }}>
        {shared.map((point) => (
          <PointRow key={point.title} point={point} />
        ))}
      </Card>

      <Text variant="captionStrong" color="secondary">
        COMO FUNCIONA
      </Text>

      <Card padding="xl" style={{ gap: theme.spacing.lg }}>
        {flow.map((point) => (
          <PointRow key={point.title} point={point} />
        ))}
      </Card>

      {canReceiveWhileClosed ? null : (
        // Dito antes de aceitar, e não depois do dia em que faria falta: é a
        // mesma honestidade que a tela de consentimento do trajeto já pratica.
        <Notice
          tone="warning"
          title="No navegador há limites"
          message="Aqui pelo navegador, disparar o alerta funciona porque seu dedo está na tela. Mas RECEBER o alerta de outro motorista só acontece com o Dinamique aberto: não chega notificação com a aba em segundo plano. No aplicativo instalado, chega."
        />
      )}

      {failed ? (
        <Notice
          tone="danger"
          title="Não conseguimos salvar"
          message="Sua escolha não foi gravada. Confira sua conexão e toque de novo."
        />
      ) : null}

      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="bodyStrong">Você pode desligar quando quiser</Text>
        <Text variant="caption" color="muted">
          Em Mais › Botão de emergência. Ao desligar, sua posição some da rede na hora e a função
          para de funcionar até você ativar de novo.
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        {consented ? (
          <Button
            label="Já está ativo"
            variant="secondary"
            fullWidth
            size="lg"
            iconName="check"
            onPress={() => router.replace('/sos')}
          />
        ) : (
          <Button
            label="Aceitar e ativar"
            variant="danger"
            size="lg"
            fullWidth
            iconName="shield"
            loading={saving}
            onPress={() => void accept()}
          />
        )}
        <Button label="Agora não" variant="ghost" fullWidth onPress={() => router.back()} />
      </View>

      {/* A rede é a segunda decisão, e ela é separada de propósito: dá para
          querer o botão para si e não querer receber alerta de ninguém. */}
      {consented && !prefs.networkOptIn ? (
        <Button
          label="Também quero receber alertas de outros"
          variant="ghost"
          iconName="megaphone"
          fullWidth
          onPress={() => void updatePrefs({ networkOptIn: true })}
        />
      ) : null}
    </Screen>
  );
}

function PointRow({ point }: { point: Point }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.dangerSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={point.icon} size={18} color={theme.colors.dangerText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{point.title}</Text>
        <Text variant="caption" color="secondary">
          {point.body}
        </Text>
      </View>
    </View>
  );
}
