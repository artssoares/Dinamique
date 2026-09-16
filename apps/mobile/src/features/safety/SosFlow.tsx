import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EMERGENCY_NUMBER, SOS_COUNTDOWN_SECONDS } from '@dinamique/business-logic';
import { Button, Notice, ProgressRing, Sheet, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useSafety } from './useSafety';

/**
 * A janela de arrependimento, e o que acontece quando ela fecha.
 *
 * Montada uma vez, acima de todas as telas, porque o botão que a abre está no
 * cabeçalho de cinco telas diferentes e o alerta que ela dispara vale para o
 * aplicativo inteiro. Enquanto ninguém segura o botão, ela não desenha nada.
 *
 * Cinco segundos com "Cancelar" ocupando a largura da tela. O botão de cancelar
 * é o maior elemento daqui de propósito: o disparo já foi decidido por três
 * segundos de dedo no botão, e o que esta tela existe para resolver é o
 * contrário disso: o bolso, a criança, o toque sem querer.
 */

/** Ligar para a polícia. Chamado no disparo, e por um botão em toda falha. */
export async function callEmergency(): Promise<void> {
  void track('sos_emergency_call');
  try {
    await Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
  } catch {
    // Um navegador sem discador não abre nada. O número está escrito na tela
    // ao lado do botão exatamente por isso.
  }
}

type Phase = 'counting' | 'sending' | 'failed';

export function SosFlow() {
  const theme = useTheme();
  const router = useRouter();
  const { armed, abort, dismiss, fire } = useSafety();

  const [remaining, setRemaining] = useState(SOS_COUNTDOWN_SECONDS);
  const [phase, setPhase] = useState<Phase>('counting');
  const [failure, setFailure] = useState<string | null>(null);
  // Guarda contra o disparo duplo: o tique que chega a zero e um segundo
  // agendado antes de o intervalo ser limpo chamariam `fire()` duas vezes, e a
  // segunda chamada bateria no limite de dez minutos do banco, e a pessoa veria
  // "você já disparou um alerta" por causa do próprio alerta dela.
  const fired = useRef(false);

  const send = useCallback(async () => {
    if (fired.current) return;
    fired.current = true;
    setPhase('sending');

    const outcome = await fire();

    if (!outcome.ok) {
      setFailure(outcome.message);
      setPhase('failed');
      return;
    }

    // Só agora a folha sai: ela ficou na tela durante o envio inteiro, que é
    // onde a falha teria de ser lida se houvesse uma.
    dismiss();

    // O 190 primeiro. É a ação que não depende de nada nosso, e a tela do
    // alerta fica montada por baixo da ligação: quando a pessoa voltar da
    // chamada, ela já está lá.
    router.push('/sos/active');
    await callEmergency();
  }, [dismiss, fire, router]);

  useEffect(() => {
    if (!armed) {
      fired.current = false;
      setRemaining(SOS_COUNTDOWN_SECONDS);
      setPhase('counting');
      setFailure(null);
      return undefined;
    }

    const timer = setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          clearInterval(timer);
          void send();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [armed, send]);

  if (!armed) return null;

  const counting = phase === 'counting';

  return (
    <Sheet
      visible
      // Tocar fora só cancela enquanto ainda dá para cancelar. Depois do
      // disparo, um toque fora não pode ser confundido com "encerrar alerta".
      onClose={() => {
        if (counting) void abort();
        else if (phase === 'failed') dismiss();
      }}
      title={counting ? 'Pedindo socorro' : phase === 'sending' ? 'Enviando o alerta' : 'Não deu'}
      description={
        counting
          ? 'Toque em Cancelar se foi sem querer.'
          : phase === 'sending'
            ? 'Avisando os motoristas por perto.'
            : undefined
      }
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        {counting ? (
          <ProgressRing
            // O anel esvazia conforme o tempo passa: o que resta na tela é o
            // tempo que resta para cancelar, não o quanto já foi.
            ratio={remaining / SOS_COUNTDOWN_SECONDS}
            size={148}
            color={theme.colors.danger}
            centreLabel={String(remaining)}
            centreHint="segundos"
            label={`Alerta em ${remaining} segundos`}
          />
        ) : null}

        {phase === 'failed' && failure ? (
          <Notice
            title="O alerta não foi enviado"
            message={failure}
            tone="danger"
            style={{ alignSelf: 'stretch' }}
          />
        ) : null}

        {phase === 'sending' ? (
          <Text variant="body" color="secondary" align="center">
            Um instante.
          </Text>
        ) : null}

        <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
          {counting ? (
            <Button
              label="Cancelar"
              size="lg"
              fullWidth
              variant="inverse"
              onPress={() => void abort()}
            />
          ) : null}

          {phase === 'failed' ? (
            <>
              <Button
                label={`Ligar ${EMERGENCY_NUMBER}`}
                size="lg"
                fullWidth
                variant="danger"
                iconName="phone"
                onPress={() => void callEmergency()}
              />
              {/* Fechar, não cancelar: o alerta não existiu, e registrar um
                  cancelamento aqui mentiria na auditoria. */}
              <Button label="Fechar" variant="ghost" fullWidth onPress={dismiss} />
            </>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
