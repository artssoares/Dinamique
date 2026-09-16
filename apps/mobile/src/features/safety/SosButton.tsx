import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { SOS_HOLD_MS } from '@dinamique/business-logic';
import { CountBadge, Icon, MIN_TOUCH_TARGET, useReducedMotion, useTheme } from '@dinamique/ui';
import { useSafetyOptional } from './useSafety';

/**
 * O botão de emergência.
 *
 * ── Onde ele fica, e por quê ──────────────────────────────────────────────
 *
 * No cabeçalho, ao lado do menu. O pedido era um botão flutuante no canto de
 * baixo, acima da navegação, "sem cobrir conteúdo nem botões existentes", e
 * essas duas condições não coexistem neste aplicativo. A barra de abas já
 * flutua no rodapé e ocupa 68dp mais o recuo; a `Screen` reserva exatamente
 * essa altura embaixo de cada tela. Qualquer botão acima da barra cai dentro
 * dos 40dp seguintes, que são conteúdo, e no rodapé de várias telas são
 * botões (Registrar, Encerrar jornada, os rodapés fixos do Histórico e do
 * Suporte). Então vale a segunda instrução do pedido: ícone no cabeçalho, no
 * padrão dos que já estão lá.
 *
 * Ele entra no grupo da ESQUERDA, junto do menu, e isso não é detalhe. O
 * cabeçalho é um `space-between` de dois grupos: o sino e a foto ficam
 * ancorados na direita, o menu na esquerda. Um ícone somado à esquerda cresce
 * para dentro do espaço vazio do meio e não desloca nada, nem um pixel do que
 * já existia muda de lugar. Somado à direita, empurraria sino e foto 52dp para
 * o lado.
 *
 * ── Como ele se parece ────────────────────────────────────────────────────
 *
 * O mesmo `IconButton` de cabeçalho em tudo menos a cor: 44dp, raio pill,
 * fundo `dangerSubtle`, ícone `dangerText`, o mesmo recuo de escala ao toque.
 * Não é um `IconButton` só porque precisa do toque prolongado e do anel, e o
 * anel é a razão de o componente existir em vez de uma `prop`.
 *
 * ── Como ele dispara ──────────────────────────────────────────────────────
 *
 * Três segundos de dedo. O anel em volta cresce junto, porque um botão que
 * exige espera sem mostrar a espera é um botão quebrado; soltar antes zera e
 * não acontece nada. Um toque curto abre a tela da função: quem tocou por
 * engano ou por curiosidade encontra a explicação, não o silêncio.
 */

/** Espessura do anel de progresso. Um pouco mais fino que o traço do ícone. */
const RING_THICKNESS = 3;

export function SosButton() {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const safety = useSafetyOptional();

  const size = MIN_TOUCH_TARGET;
  const radius = (size - RING_THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const holding = useRef<Animated.CompositeAnimation | null>(null);

  // Sem provedor não há função: o cabeçalho é montado em telas que rodam fora
  // dele, e um botão de socorro que não sabe disparar não deve existir.
  const active = safety?.alert ?? null;
  const incoming = safety?.incoming.length ?? 0;

  const stopHold = useCallback(() => {
    holding.current?.stop();
    holding.current = null;
    Animated.timing(progress, {
      toValue: 0,
      duration: theme.motion.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, theme.motion.fast]);

  // Um alerta que entrou no ar por outro caminho (a tela de configuração, uma
  // recarga) tem de zerar o anel: ele não está mais medindo nada.
  useEffect(() => {
    if (active) stopHold();
  }, [active, stopHold]);

  if (!safety) return null;

  function feedback(style: Haptics.ImpactFeedbackStyle) {
    try {
      void Haptics.impactAsync(style);
    } catch {
      // No navegador não existe; e um toque sem vibração continua sendo um
      // toque.
    }
  }

  function begin() {
    Animated.timing(press, {
      toValue: 1,
      duration: theme.motion.instant,
      useNativeDriver: true,
    }).start();

    // Já tem alerta no ar: o botão leva para a tela dele em vez de abrir um
    // segundo, que o banco recusaria de todo modo.
    if (active) return;

    if (!safety!.consented) return;

    feedback(Haptics.ImpactFeedbackStyle.Light);

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 1 : SOS_HOLD_MS,
      // Linear de propósito: o anel é um cronômetro, e uma curva faria os três
      // segundos parecerem mais longos no meio do caminho.
      easing: Easing.linear,
      useNativeDriver: false,
    });

    holding.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      holding.current = null;
      progress.setValue(0);
      feedback(Haptics.ImpactFeedbackStyle.Heavy);
      safety!.arm();
    });
  }

  function end() {
    Animated.timing(press, {
      toValue: 0,
      duration: theme.motion.instant,
      useNativeDriver: true,
    }).start();
    stopHold();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        active
          ? 'Alerta de emergência ativo. Abrir a tela do alerta.'
          : 'Botão de emergência'
      }
      accessibilityHint={
        safety.consented
          ? 'Segure por três segundos para pedir socorro. Um toque abre as explicações.'
          : 'Toque para ativar o botão de emergência.'
      }
      onPressIn={begin}
      onPressOut={end}
      onPress={() => {
        if (active) router.push('/sos/active');
        else if (!safety.consented) router.push('/sos/consent');
        else router.push('/sos');
      }}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: theme.radius.pill,
          // O mesmo tom de alerta que o aplicativo já usa para erro e despesa.
          // Aceso quando existe um alerta no ar: aí ele para de ser discreto.
          backgroundColor: active ? theme.colors.danger : theme.colors.dangerSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }),
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }],
        }}
      >
        <Icon
          name="shield"
          size={Math.round(size * 0.5)}
          color={active ? theme.colors.textOnBrand : theme.colors.dangerText}
        />
      </Animated.View>

      {/* O anel fica fora da View que escala, senão ele encolheria junto e a
          contagem pareceria andar para trás no instante do toque. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Svg width={size} height={size}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.danger}
            strokeWidth={RING_THICKNESS}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progress.interpolate({
              inputRange: [0, 1],
              outputRange: [circumference, 0],
            })}
            // Começa às doze horas, como o anel da meta.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>

      {incoming > 0 && !active ? (
        <CountBadge count={incoming} style={{ position: 'absolute', top: -2, right: -2 }} />
      ) : null}
    </Pressable>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
