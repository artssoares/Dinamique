import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EMERGENCY_NUMBER,
  MAX_EMERGENCY_CONTACTS,
  SOS_ALERT_TTL_MINUTES,
  SOS_DAILY_LIMIT,
  SOS_MIN_INTERVAL_MINUTES,
  SOS_RADIUS_M,
  platePrefix as prefixOf,
} from '@dinamique/business-logic';
import {
  Badge,
  Button,
  Card,
  Field,
  ListRow,
  Notice,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useSafety } from '@/features/safety/useSafety';
import { canReceiveWhileClosed } from '@/features/safety/position';
import { IncomingAlertCard } from '@/features/safety/IncomingAlertCard';

/**
 * Botão de emergência: tudo o que é decisão do motorista, numa tela.
 *
 * Mesma forma que "Trajeto e privacidade": ligar, desligar, escolher se
 * participa da rede, dizer como te reconhecer, e ver o registro dos próprios
 * alertas. Uma função que compartilha onde alguém está tem de ser desligável
 * aqui, num toque, ou não deveria existir.
 */
export default function SosSettings() {
  const theme = useTheme();
  const router = useRouter();
  const {
    ready,
    consented,
    prefs,
    updatePrefs,
    revokeConsent,
    contacts,
    history,
    incoming,
    alert,
    arm,
  } = useSafety();

  const [colour, setColour] = useState(prefs.vehicleColour ?? '');
  const [plate, setPlate] = useState(prefs.platePrefix ?? '');
  const [savedMark, setSavedMark] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);

  // As preferências chegam depois da primeira pintura. Sem isto os dois campos
  // nasceriam vazios para quem já os preencheu, e salvar apagaria o que estava
  // lá. Só refazem a leitura quando o valor guardado muda, o que só acontece
  // depois de um salvamento que deu certo.
  useEffect(() => {
    setColour(prefs.vehicleColour ?? '');
    setPlate(prefs.platePrefix ?? '');
  }, [prefs.vehicleColour, prefs.platePrefix]);

  async function toggleNetwork(next: boolean) {
    // Apagar a presença ao sair é parte do `updatePrefs`, não desta tela: quem
    // desliga pelo consentimento tem de receber o mesmo tratamento.
    const ok = await updatePrefs({ networkOptIn: next });
    if (!ok) return;
    void track(next ? 'sos_network_joined' : 'sos_network_left');
  }

  async function saveMark() {
    setMarkError(null);
    const prefix = prefixOf(plate);
    if (plate.trim().length > 0 && prefix === null) {
      setMarkError('Escreva as três primeiras letras da placa, por exemplo ABC.');
      return;
    }
    const ok = await updatePrefs({ vehicleColour: colour, platePrefix: plate });
    if (!ok) {
      setMarkError('Não conseguimos salvar. Confira sua conexão e tente de novo.');
      return;
    }
    setSavedMark(true);
  }

  return (
    <Screen
      header={<ScreenHeader title="Botão de emergência" onBack={() => router.back()} />}
      gap="lg"
    >
      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="subtitle">
              {consented ? 'Ativo' : 'Desligado'}
            </Text>
            <Text variant="caption" color="secondary">
              {consented
                ? 'O botão vermelho fica no alto da tela, ao lado do menu. Segure por 3 segundos.'
                : 'Você precisa aceitar o compartilhamento de dados antes de usar.'}
            </Text>
          </View>
          <Badge label={consented ? 'Ativo' : 'Off'} tone={consented ? 'danger' : 'neutral'} />
        </View>

        {consented ? (
          <Button
            label="Desligar o botão de emergência"
            variant="ghost"
            fullWidth
            onPress={() => void revokeConsent()}
          />
        ) : (
          <Button
            label="Ler e ativar"
            variant="danger"
            iconName="shield"
            fullWidth
            onPress={() => router.push('/sos/consent')}
          />
        )}
      </Card>

      {alert ? (
        <Notice
          tone="danger"
          title="Você tem um alerta ativo agora"
          message="Sua localização está sendo compartilhada. Abra a tela do alerta para encerrar."
        />
      ) : null}

      {alert ? (
        <Button
          label="Abrir o alerta ativo"
          variant="danger"
          iconName="alert"
          fullWidth
          size="lg"
          onPress={() => router.push('/sos/active')}
        />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Sua lista" />
        <Card padding="none" style={{ overflow: 'hidden' }}>
          <ListRow
            first
            icon="phone"
            iconTone="danger"
            label="Contatos de emergência"
            description={
              contacts.length === 0
                ? `Ninguém cadastrado. Até ${MAX_EMERGENCY_CONTACTS} pessoas`
                : `${contacts.length} de ${MAX_EMERGENCY_CONTACTS}: ${contacts
                    .map((contact) => contact.name)
                    .join(', ')}`
            }
            onPress={() => router.push('/sos/contacts')}
          />
          <ListRow
            icon="megaphone"
            iconTone="warning"
            label="Alertas recebidos"
            description={
              incoming.length > 0
                ? `${incoming.length} ativo${incoming.length > 1 ? 's' : ''} agora`
                : 'Avisos de motoristas por perto'
            }
            badge={incoming.length}
            onPress={() => router.push('/sos/received')}
          />
        </Card>
      </View>

      <Card padding="xl" style={{ gap: theme.spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text variant="bodyStrong">Participar da rede de alertas</Text>
          </View>
          <Switch
            value={prefs.networkOptIn}
            disabled={!consented || !ready}
            onValueChange={(next) => void toggleNetwork(next)}
          />
        </View>
        <Text variant="caption" color="muted">
          Com isso ligado você recebe o aviso quando outro motorista do Dinamique pedir socorro a
          menos de {SOS_RADIUS_M / 1000} km e, em troca, é encontrável por distância quando
          alguém precisar. Sua posição não é legível por nenhum outro usuário: ela só é usada para
          medir quem está dentro do raio.
        </Text>
        <Text variant="caption" color="muted">
          Com isso desligado, seu botão continua funcionando. Você só não recebe o de ninguém.
        </Text>
        {canReceiveWhileClosed ? null : (
          <Text variant="caption" color="warning">
            No navegador, o aviso só aparece com o Dinamique aberto na tela. No aplicativo
            instalado, chega como notificação do celular.
          </Text>
        )}
      </Card>

      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="bodyStrong">Como te reconhecer</Text>
        <Text variant="caption" color="muted">
          Vai junto com o alerta para quem estiver por perto. O modelo vem do seu veículo
          cadastrado; a placa entra com as três primeiras letras e nada mais: a placa inteira não
          é guardada.
        </Text>
        <Field
          label="Cor do carro"
          placeholder="Prata"
          value={colour}
          onChangeText={(text) => {
            setColour(text);
            setSavedMark(false);
          }}
          maxLength={30}
        />
        <Field
          label="Três primeiras letras da placa"
          placeholder="ABC"
          value={plate}
          autoCapitalize="characters"
          maxLength={8}
          onChangeText={(text) => {
            setPlate(text);
            setSavedMark(false);
          }}
          error={markError}
          hint={prefixOf(plate) ? `Vai aparecer como "Placa ${prefixOf(plate)}"` : undefined}
        />
        <Button
          label={savedMark ? 'Salvo' : 'Salvar'}
          variant={savedMark ? 'secondary' : 'primary'}
          iconName={savedMark ? 'check' : undefined}
          fullWidth
          onPress={() => void saveMark()}
        />
      </Card>

      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="bodyStrong">Como o aviso chega para os outros</Text>
        <Text variant="caption" color="muted">
          Sem nome, sem telefone e sem convite para ir ao local. A orientação é sempre a mesma:
          ligar {EMERGENCY_NUMBER}.
        </Text>
        {consented && !alert ? (
          // Um disparo de demonstração de verdade: passa pela contagem, fica
          // registrado, expira como qualquer outro, e não acorda ninguém. É
          // como se vê a função inteira funcionando sem chamar a polícia.
          <Button
            label="Testar em modo demonstração"
            variant="ghost"
            iconName="play"
            fullWidth
            onPress={() => arm({ demo: true })}
          />
        ) : null}

        {showSample ? (
          <IncomingAlertCard
            sample
            alert={{
              id: 'exemplo',
              userId: 'exemplo',
              lat: -23.5505,
              lon: -46.6333,
              status: 'active',
              vehicleLabel: 'Chevrolet Onix 2019',
              vehicleColour: 'Prata',
              platePrefix: 'ABC',
              notifiedCount: 0,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 22 * 60 * 1000).toISOString(),
              isDemo: true,
              distanceM: 1200,
            }}
          />
        ) : (
          <Button
            label="Ver um exemplo"
            variant="ghost"
            iconName="eye"
            fullWidth
            onPress={() => setShowSample(true)}
          />
        )}
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Seus alertas" />
        {history.length === 0 ? (
          <Card padding="xl">
            <Text variant="caption" color="muted">
              Você nunca disparou um alerta. Quando disparar, cada um aparece aqui com data, hora e
              se foi cancelado: é o mesmo registro que fica guardado para auditoria.
            </Text>
          </Card>
        ) : (
          <Card padding="none" style={{ overflow: 'hidden' }}>
            {history.map((item, index) => (
              <ListRow
                key={item.id}
                first={index === 0}
                icon={item.status === 'cancelled' ? 'close' : 'shield'}
                iconTone={item.status === 'cancelled' ? 'neutral' : 'danger'}
                label={new Date(item.createdAt).toLocaleString('pt-BR')}
                description={describeHistory(item.status, item.notifiedCount, item.isDemo)}
                showChevron={false}
              />
            ))}
          </Card>
        )}
        <Text variant="caption" color="muted">
          Limite: {SOS_DAILY_LIMIT} alertas por dia, um a cada {SOS_MIN_INTERVAL_MINUTES} minutos.
          Cancelar na contagem não gasta nenhum. O compartilhamento de localização para ao encerrar
          ou depois de {SOS_ALERT_TTL_MINUTES} minutos, o que vier primeiro.
        </Text>
      </View>
    </Screen>
  );
}

function describeHistory(status: string, notified: number, demo: boolean): string {
  const tail = demo ? ' · demonstração' : '';
  switch (status) {
    case 'cancelled':
      return `Cancelado antes de avisar ninguém${tail}`;
    case 'active':
      return `Ativo agora · ${notified} avisado(s)${tail}`;
    case 'ended':
      return `Encerrado por você · ${notified} avisado(s)${tail}`;
    case 'expired':
      return `Encerrado pelo prazo · ${notified} avisado(s)${tail}`;
    default:
      return `${notified} avisado(s)${tail}`;
  }
}
