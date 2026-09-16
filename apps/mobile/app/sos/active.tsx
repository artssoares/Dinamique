import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EMERGENCY_NUMBER,
  SOS_ALERT_TTL_MINUTES,
  alertRemainingSeconds,
  contactShareMessage,
  describeReach,
  formatRemaining,
  mapLink,
} from '@dinamique/business-logic';
import {
  Button,
  Card,
  Icon,
  ListRow,
  Notice,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useSafety } from '@/features/safety/useSafety';
import { callEmergency } from '@/features/safety/SosFlow';

/**
 * Alerta ativo.
 *
 * Três coisas, nesta ordem de tamanho na tela: o que está acontecendo, quem
 * foi avisado, e como parar. "Encerrar alerta" é o maior botão daqui porque a
 * pessoa vai procurá-lo com a mão tremendo, possivelmente à noite, dentro de
 * um carro.
 *
 * Quando ninguém está no raio, isto não é uma tela vazia: o aviso diz que
 * ninguém foi avisado, e o 190 e os contatos sobem para o topo como a ação
 * principal, porque nessa situação eles são a única.
 */
export default function ActiveAlert() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useSession();
  const { alert, contacts, close } = useSafety();
  const [closing, setClosing] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  // O prazo anda sozinho na tela: um número parado em "faltam 30 minutos" por
  // meia hora é um número que ninguém acredita.
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const remaining = alert ? alertRemainingSeconds(alert.expiresAt, tick) : 0;

  if (!alert) {
    return (
      <Screen
        header={<ScreenHeader title="Alerta" onBack={() => router.back()} />}
        gap="lg"
        grow
      >
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <Text variant="subtitle">Nenhum alerta ativo</Text>
          <Text variant="body" color="secondary">
            Seu alerta foi encerrado e sua localização não está mais sendo compartilhada.
          </Text>
          <Button
            label={`Ligar ${EMERGENCY_NUMBER}`}
            variant="danger"
            iconName="phone"
            fullWidth
            onPress={() => void callEmergency()}
          />
          <Button label="Voltar" variant="ghost" fullWidth onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  async function end() {
    setClosing(true);
    const ok = await close();
    setClosing(false);
    if (ok) router.back();
  }

  return (
    <Screen
      header={<ScreenHeader title="Alerta ativo" onBack={() => router.back()} />}
      gap="lg"
      footer={
        // Pinado no rodapé, sempre visível, sem depender de rolagem. É o
        // controle que a pessoa vai procurar, e procurar rolando uma tela é o
        // que ela não vai conseguir fazer neste momento.
        <Button
          label="Encerrar alerta"
          variant="danger"
          size="lg"
          fullWidth
          iconName="stop"
          loading={closing}
          onPress={() => void end()}
        />
      }
    >
      <Card
        padding="xl"
        style={{
          gap: theme.spacing.md,
          backgroundColor: theme.colors.dangerSubtle,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Icon name="shield" size={20} color={theme.colors.dangerText} />
          <Text variant="subtitle" color="danger">
            {alert.isDemo ? 'Alerta de demonstração' : 'Alerta enviado'}
          </Text>
        </View>
        <Text variant="body" color="danger">
          {alert.isDemo
            ? 'Este é um disparo de demonstração: ele fica registrado, expira como qualquer outro e não avisa ninguém de verdade.'
            : describeReach(alert.notifiedCount)}
        </Text>
        <Text variant="caption" color="danger">
          Sua localização está sendo compartilhada, {formatRemaining(remaining)} de{' '}
          {SOS_ALERT_TTL_MINUTES} minutos. Ao encerrar, para na hora.
        </Text>
      </Card>

      <Button
        label={`Ligar ${EMERGENCY_NUMBER}`}
        variant="danger"
        size="lg"
        iconName="phone"
        fullWidth
        onPress={() => void callEmergency()}
      />

      {alert.notifiedCount === 0 && !alert.isDemo ? (
        <Notice
          tone="warning"
          title="Nenhum motorista por perto"
          message="Ninguém do Dinamique estava dentro do raio agora. Isso não muda o mais importante: a ligação para a polícia e o aviso aos seus contatos."
        />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Seus contatos de emergência" />
        {contacts.length === 0 ? (
          <Card padding="xl" style={{ gap: theme.spacing.md }}>
            <Text variant="caption" color="muted">
              Você não cadastrou ninguém. Dá para fazer isso depois. Agora, o que vale é o{' '}
              {EMERGENCY_NUMBER}.
            </Text>
            <Button
              label="Cadastrar contatos"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/sos/contacts')}
            />
          </Card>
        ) : (
          <>
            <Card padding="none" style={{ overflow: 'hidden' }}>
              {contacts.map((contact, index) => (
                <ListRow
                  key={contact.slot}
                  first={index === 0}
                  icon="phone"
                  iconTone="danger"
                  label={contact.name}
                  description={contact.phone}
                  right={
                    <Button
                      label="Mandar local"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        const message = contactShareMessage({
                          driverName: profile?.preferredName ?? profile?.firstName ?? null,
                          lat: alert.lat ?? 0,
                          lon: alert.lon ?? 0,
                        });
                        void Linking.openURL(
                          `sms:${contact.phone}?body=${encodeURIComponent(message)}`,
                        ).catch(() => undefined);
                      }}
                    />
                  }
                  showChevron={false}
                />
              ))}
            </Card>
            {/* Dito onde a pessoa vai procurar, e não num comentário de
                código: enquanto não houver provedor de SMS contratado, o
                aviso ao familiar depende deste toque. */}
            <Text variant="caption" color="muted">
              O Dinamique tenta avisar seus contatos automaticamente. Se a mensagem não chegar,
              estes botões abrem o SMS do seu celular já escrito, com sua localização.
            </Text>
          </>
        )}
      </View>

      {alert.lat !== null && alert.lon !== null ? (
        <Button
          label="Ver minha localização no mapa"
          variant="ghost"
          iconName="compass"
          fullWidth
          onPress={() => {
            void Linking.openURL(mapLink(alert.lat!, alert.lon!)).catch(() => undefined);
          }}
        />
      ) : null}
    </Screen>
  );
}
