import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
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
const TOOLTIP_GAP = 16;
const TOOLTIP_MAX_WIDTH = 380;

/**
 * Tour do produto (§23).
 *
 * O conteúdo vem do banco (`tour_steps`), editável pelo Admin – texto de
 * apresentação muda com frequência e não deveria exigir uma nova versão do
 * aplicativo na loja.
 *
 * A apresentação segue o padrão de coach marks: a tela inteira escurece, o
 * controle de que o passo fala continua aceso dentro de um recorte, e o texto
 * aparece encostado nele. A cada passo o recorte se move. Assim a pessoa
 * aprende onde as coisas ficam, e não apenas que elas existem – a versão
 * anterior era um cartão fixo no rodapé, que explicava sem apontar.
 *
 * "Pular" e terminar têm o mesmo efeito: quem pulou não quer ver de novo, e
 * insistir seria desrespeitoso.
 */
export function Tour() {
  const theme = useTheme();
  const registry = useTourRegistry();
  const { session, profile, refresh } = useSession();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const fade = useRef(new Animated.Value(0)).current;
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

    const key = TARGET_BY_SLUG[step.slug];
    if (!key) {
      setRect(null);
      return;
    }

    // One frame of delay so a target that was just mounted has a layout.
    const timer = setTimeout(() => {
      void registry.measure(key).then((measured) => {
        if (active) setRect(measured);
      });
    }, 60);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [index, registry, step, visible]);

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: theme.motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade, index, theme.motion.base, visible]);

  useEffect(() => {
    if (!visible) return;
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
  }, [pulse, visible]);

  const finish = useCallback(async () => {
    setVisible(false);
    if (!session?.user) return;
    await supabase
      .from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    await refresh();
  }, [refresh, session?.user?.id]);

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

  const holeRadius = hole ? Math.min(hole.width, hole.height) / 2 : 0;

  // Below the highlight when there is room, above it otherwise. A tooltip that
  // covers the thing it is describing is worse than no tooltip.
  const spaceBelow = hole ? screenHeight - (hole.y + hole.height) : 0;
  const placeBelow = !hole || spaceBelow > 260;

  const tooltipStyle = hole
    ? placeBelow
      ? { top: hole.y + hole.height + TOOLTIP_GAP }
      : { bottom: screenHeight - hole.y + TOOLTIP_GAP }
    : { top: screenHeight / 2 - 130 };

  return (
    <Modal visible transparent animationType="none" onRequestClose={finish} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        {/* The scrim. One path with an even-odd fill: the outer rectangle is
            the whole screen, the inner rounded rectangle is the cut-out, and
            the hole is genuinely transparent rather than a lighter patch. */}
        <Animated.View style={{ ...FILL, opacity: fade }} pointerEvents="none">
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
            "Pular" and finishing, so nobody dismisses the tour by accident. */}
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
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                ],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
              }}
            />
          ) : null}

          <Animated.View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              alignItems: 'center',
              opacity: fade,
              transform: [
                { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
              ...tooltipStyle,
            }}
          >
            <View
              style={[
                {
                  width: '100%',
                  maxWidth: TOOLTIP_MAX_WIDTH,
                  gap: theme.spacing.lg,
                  padding: theme.spacing.xl,
                  borderRadius: theme.radius['2xl'],
                  backgroundColor: theme.colors.surfacePrimary,
                },
                theme.elevation.lg,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
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

              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="title">{step.title}</Text>
                <Text variant="body" color="secondary">
                  {step.description}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pular o tour"
                  onPress={finish}
                  hitSlop={10}
                  style={{ paddingVertical: theme.spacing.sm, paddingRight: theme.spacing.md }}
                >
                  <Text variant="captionStrong" color="secondary">
                    Pular
                  </Text>
                </Pressable>

                <View style={{ flex: 1 }} />

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
            </View>

            {hole ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  [placeBelow ? 'top' : 'bottom']: -7,
                  left: Math.max(
                    24,
                    Math.min(
                      screenWidth - 56,
                      hole.x + hole.width / 2 - 24,
                    ),
                  ),
                }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    backgroundColor: theme.colors.surfacePrimary,
                    transform: [{ rotate: '45deg' }],
                    borderRadius: 2,
                  }}
                />
              </View>
            ) : null}
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
