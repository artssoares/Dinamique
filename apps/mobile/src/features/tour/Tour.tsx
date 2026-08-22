import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Text, useReducedMotion, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { placeCard, usableRect } from './placement';
import { useTourRegistry, type TargetRect } from './TourProvider';

interface TourStep {
  id: string;
  slug: string;
  title: string;
  description: string;
}

/**
 * Which UI element each seeded step points at.
 *
 * The anchor cannot come from the database: an admin can write new copy, but
 * cannot invent a control that exists in the app. A step whose slug is not
 * mapped here – or whose target is not on screen right now – still shows, as a
 * centred card with no cut-out, rather than pointing at nothing.
 */
const TARGET_BY_SLUG: Record<string, string> = {
  'meta-do-dia': 'goal',
  iniciar: 'start-journey',
  registrar: 'tab-record',
  lucro: 'today-stats',
  insights: 'tab-insights',
  notificacoes: 'bell',
};

/** Breathing room between the highlight and the edge of the cut-out. */
const PADDING = 10;
/** Between the cut-out and the card that describes it. */
const GAP = 14;
/** Between the card and the edge of the safe area. It never touches. */
const MARGIN = 16;
const CARD_MAX_WIDTH = 380;
const ARROW = 14;

/**
 * Tour do produto (§23).
 *
 * O conteúdo vem do banco (`tour_steps`), editável pelo Admin – texto de
 * apresentação muda com frequência e não deveria exigir uma nova versão do
 * aplicativo na loja.
 *
 * A apresentação segue o padrão de coach marks: a tela inteira escurece, o
 * controle de que o passo fala continua aceso dentro de um recorte, e o texto
 * aparece encostado nele.
 *
 * O posicionamento é o ponto em que a versão anterior travava a tela. Ela
 * decidia "cabe embaixo" comparando o espaço livre com 260, um palpite: quando
 * o cartão era maior do que isso – texto mais longo, tela menor, teclado
 * aberto – ele descia para fora da tela levando junto "Pular" e "Próximo", e
 * não sobrava nenhum jeito de sair a não ser recarregar. Agora o cartão é
 * medido de verdade, o resultado é preso dentro da área segura, o texto rola
 * dentro do cartão em vez de empurrar os botões, e "Pular" existe em todos os
 * passos. Nenhum caminho leva a uma tela sem saída.
 *
 * "Pular" e terminar têm o mesmo efeito: quem pulou não quer ver de novo, e
 * insistir seria desrespeitoso.
 */
export function Tour() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const registry = useTourRegistry();
  const { session, profile, refresh } = useSession();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  // The scrim fades in once. The card fades on every step, so the darkness
  // never blinks off and back on between two coach marks.
  const scrim = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Só depois do onboarding, e só para quem ainda não viu.
    if (!session?.user || !profile) return;
    if (profile.onboardingCompletedAt === null) return;
    if (profile.tourCompletedAt !== null) return;

    void supabase
      .from('tour_steps')
      .select('id, slug, title, description')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const rows = (data as TourStep[] | null) ?? [];
        setSteps(rows);
        setVisible(rows.length > 0);
      });
  }, [session?.user?.id, profile?.onboardingCompletedAt, profile?.tourCompletedAt]);

  const step = steps[index];

  // Re-measure on every step: the anchor may have moved, or may not exist on
  // the screen the user happens to be looking at.
  useEffect(() => {
    let active = true;
    if (!visible || !step || !registry) return;

    // Clearing first matters: without it the new step is positioned against
    // the previous step's rectangle for a frame or two.
    setRect(null);

    const key = TARGET_BY_SLUG[step.slug];
    if (!key) return;

    // A moment's delay so a target that was just mounted has a layout.
    const timer = setTimeout(() => {
      void registry.measure(key).then((measured) => {
        if (active) setRect(usableRect(measured, screenWidth, screenHeight));
      });
    }, 80);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [index, registry, screenHeight, screenWidth, step, visible]);

  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      scrim.setValue(1);
      return;
    }
    const animation = Animated.timing(scrim, {
      toValue: 1,
      duration: theme.motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, scrim, theme.motion.base, visible]);

  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      card.setValue(1);
      return;
    }
    card.setValue(0);
    const animation = Animated.spring(card, {
      toValue: 1,
      stiffness: 200,
      damping: 24,
      mass: 0.9,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [card, index, reduced, visible]);

  useEffect(() => {
    if (!visible || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, visible]);

  const finish = useCallback(async () => {
    setVisible(false);
    if (!session?.user) return;
    await supabase
      .from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    await refresh();
  }, [refresh, session?.user?.id]);

  const onCardLayout = useCallback((event: LayoutChangeEvent) => {
    setCardHeight(event.nativeEvent.layout.height);
  }, []);

  if (!visible || !step) return null;

  const isLast = index === steps.length - 1;

  const hole = rect
    ? {
        x: Math.max(0, rect.x - PADDING),
        y: Math.max(0, rect.y - PADDING),
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  // A pill for a small round control, a rounded rectangle for a card. The old
  // rule (half the shorter side) turned a wide block into a lozenge.
  const holeRadius = hole ? Math.min(theme.radius['2xl'], hole.height / 2, hole.width / 2) : 0;

  // All of the arithmetic lives in `placement.ts`, with tests: getting it
  // wrong is what put the card, and its only way out, off the screen.
  const { top, placement, maxHeight: cardMaxHeight } = placeCard({
    hole,
    cardHeight,
    screenHeight,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    gap: GAP,
    margin: MARGIN,
  });

  const arrowLeft = hole
    ? Math.max(MARGIN + 12, Math.min(screenWidth - MARGIN - 12 - ARROW, hole.x + hole.width / 2 - ARROW / 2))
    : 0;

  return (
    <Modal visible transparent animationType="none" onRequestClose={finish} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        {/* The scrim. One path with an even-odd fill: the outer rectangle is
            the whole screen, the inner rounded rectangle is the cut-out, and
            the hole is genuinely transparent rather than a lighter patch. */}
        <Animated.View style={{ ...FILL, opacity: scrim }} pointerEvents="none">
          <Svg width={screenWidth} height={screenHeight}>
            <Path
              d={
                hole
                  ? `M0 0H${screenWidth}V${screenHeight}H0Z ${roundedRectPath(
                      hole.x,
                      hole.y,
                      hole.width,
                      hole.height,
                      holeRadius,
                    )}`
                  : `M0 0H${screenWidth}V${screenHeight}H0Z`
              }
              fill={theme.colors.overlayStrong}
              fillRule="evenodd"
            />
          </Svg>
        </Animated.View>

        {/* Tapping the scrim does nothing on purpose: the only ways out are
            "Pular" and finishing, so nobody dismisses the tour by accident.
            Which is exactly why "Pular" has to be on screen at every step. */}
        <View style={FILL} pointerEvents="box-none">
          {hole ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: hole.x,
                top: hole.y,
                width: hole.width,
                height: hole.height,
                borderRadius: holeRadius,
                borderWidth: 2,
                borderColor: theme.colors.brandPrimary,
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
                ],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
              }}
            />
          ) : null}

          <Animated.View
            onLayout={onCardLayout}
            style={{
              position: 'absolute',
              top,
              left: MARGIN,
              right: MARGIN,
              maxHeight: cardMaxHeight,
              alignItems: 'center',
              opacity: card,
              transform: [
                { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                { scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            }}
          >
            {/* The arrow is drawn before the card so the card's own surface
                covers its base. It only appears when the card really is next
                to the cut-out. */}
            {hole && placement !== 'floating' ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  [placement === 'below' ? 'top' : 'bottom']: -ARROW / 2,
                  left: arrowLeft - MARGIN,
                  width: ARROW,
                  height: ARROW,
                  backgroundColor: theme.colors.surfacePrimary,
                  transform: [{ rotate: '45deg' }],
                  borderRadius: 2,
                }}
              />
            ) : null}

            <View
              style={[
                {
                  width: '100%',
                  maxWidth: CARD_MAX_WIDTH,
                  maxHeight: cardMaxHeight,
                  borderRadius: theme.radius['2xl'],
                  backgroundColor: theme.colors.surfacePrimary,
                  overflow: 'hidden',
                },
                theme.elevation.lg,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: theme.spacing.xl,
                  paddingTop: theme.spacing.xl,
                }}
              >
                <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                  {steps.map((_, position) => (
                    <View
                      key={position}
                      style={{
                        width: position === index ? 18 : 6,
                        height: 6,
                        borderRadius: theme.radius.pill,
                        backgroundColor:
                          position <= index
                            ? theme.colors.brandPrimary
                            : theme.colors.borderPrimary,
                      }}
                    />
                  ))}
                </View>
                <Text variant="caption" color="secondary">
                  {index + 1} de {steps.length}
                </Text>
              </View>

              {/* Long copy scrolls inside the card. It never grows the card
                  past the screen, so the controls below can never leave it. */}
              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={{
                  gap: theme.spacing.sm,
                  padding: theme.spacing.xl,
                  paddingBottom: theme.spacing.md,
                }}
                showsVerticalScrollIndicator={false}
              >
                <Text variant="title">{step.title}</Text>
                <Text variant="body" color="secondary">
                  {step.description}
                </Text>
              </ScrollView>

              <View
                style={{
                  gap: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.xl,
                  paddingBottom: theme.spacing.xl,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: theme.spacing.sm,
                  }}
                >
                  {index > 0 ? (
                    <Button
                      label="Voltar"
                      variant="ghost"
                      size="sm"
                      onPress={() => setIndex(index - 1)}
                    />
                  ) : null}

                  <Button
                    label={isLast ? 'Entendi' : 'Próximo'}
                    size="sm"
                    iconName={isLast ? 'check' : 'chevronRight'}
                    iconPosition="trailing"
                    onPress={() => (isLast ? void finish() : setIndex(index + 1))}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pular o tour"
                  onPress={() => void finish()}
                  hitSlop={10}
                  style={{ alignSelf: 'center', paddingVertical: theme.spacing.xs }}
                >
                  <Text variant="captionStrong" color="secondary">
                    Pular o tour
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

/** The overlay covers the window, above every screen in the stack. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * A rounded rectangle as a separate SVG sub-path. Appended to the full-screen
 * rectangle and filled with `evenodd`, it becomes a hole rather than a shape –
 * which is what makes the highlighted control genuinely visible instead of
 * merely lighter.
 */
function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M${x + r} ${y}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V${y + height - r}`,
    `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}
