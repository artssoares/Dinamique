import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Icon, type IconName } from '../icons/Icon';
import { Gradient } from './Gradient';
import { Text } from './Text';

/**
 * Which of the deck's three colourways a card wears.
 *
 * A tone, not a colour: the card says what kind of fact it carries and the
 * theme decides what that looks like. `warm` is the only one that inks its
 * type dark, which is the whole reason it gets to be that bright an orange.
 */
export type HeroTone = 'brand' | 'warm' | 'deep';

export interface HeroDeckCard {
  /** Stable across reorders. The deck keys and tracks cards by this. */
  key: string;
  tone: HeroTone;
  /** Left of the strip, e.g. "Meta de hoje". Visible at every depth. */
  title: string;
  titleIcon?: IconName;
  /**
   * Right of the strip. The one fact this card is worth turning over for,
   * which is why it is never decoration: it is what the driver reads while
   * the card is still at the back.
   */
  summary: string;
  /** 0 to 1. Draws a progress bar along the bottom of the strip. */
  progress?: number;
  /** Small line above the figure, e.g. "Lucro de hoje". */
  label: string;
  /** The figure. A node so Home can animate it with <Money />. */
  children: ReactNode;
  /** Two or three label/value pairs along the bottom. */
  details?: { label: string; value: string }[];
  /** Where the card goes when it is already at the front and gets tapped. */
  onPress?: () => void;
  /** What that tap does, for a screen reader. */
  actionLabel?: string;
}

export interface HeroDeckProps {
  cards: HeroDeckCard[];
  style?: StyleProp<ViewStyle>;
}

/** How much of each card behind shows above the one in front. */
const PEEK = 34;

/** How far each card behind is inset horizontally, per step back. */
const STEP_INSET = 10;

/** Height of the progress bar on a card's strip. */
const BAR = 3;

function gradientFor(theme: Theme, tone: HeroTone): [string, string] {
  if (tone === 'warm') return [theme.colors.heroBackFrom, theme.colors.heroBackTo];
  if (tone === 'deep') return [theme.colors.heroDeepFrom, theme.colors.heroDeepTo];
  return [theme.colors.heroFrom, theme.colors.heroTo];
}

function inkFor(theme: Theme, tone: HeroTone): string {
  return tone === 'warm' ? theme.colors.textOnHeroBack : theme.colors.textOnBrand;
}

/**
 * The headline card on Home, and the app's one piece of shape identity.
 *
 * A stack of cards rather than a single card, because a driver at a traffic
 * light has room for one figure but wants three. The card in front carries its
 * figure in full; the ones behind show a strip with their own name and the one
 * number they exist for. Tapping a strip pulls that card to the front and
 * pushes the others back a place, which is the same motion as taking a card
 * out of a hand and laying it down.
 *
 * Every card has the same anatomy — a strip across the top, a body below it —
 * so a card looks like itself whether it is in front or at the back. That is
 * what makes the movement legible rather than a shuffle of unrelated panels.
 *
 * The whole deck is one press target per card and nothing else: there is no
 * swipe, no dots, no chevrons. A control a driver has to learn is a control
 * they will not use.
 */
export function HeroDeck({ cards, style }: HeroDeckProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  // Front first. Stored as keys rather than indices so a card list that
  // changes underneath — a goal being set, a week's data arriving — cannot
  // silently swap which card the driver was looking at.
  const [order, setOrder] = useState<string[]>(() => cards.map((card) => card.key));

  useEffect(() => {
    setOrder((current) => {
      const known = new Set(cards.map((card) => card.key));
      const kept = current.filter((key) => known.has(key));
      const added = cards.map((card) => card.key).filter((key) => !current.includes(key));
      // New cards join at the back. Whatever the driver had in front stays in
      // front: a card appearing is never a reason to take away the one they
      // chose to look at.
      const next = [...kept, ...added];
      return next.length === current.length && next.every((key, i) => key === current[i])
        ? current
        : next;
    });
  }, [cards]);

  const depths = useMemo(() => {
    const map = new Map<string, number>();
    order.forEach((key, index) => map.set(key, index));
    return map;
  }, [order]);

  const bringToFront = useCallback((key: string) => {
    setOrder((current) =>
      current[0] === key ? current : [key, ...current.filter((other) => other !== key)],
    );
  }, []);

  // The tallest card decides the height, so the deck does not resize when a
  // shorter card comes forward. Measured rather than assumed: the figure is a
  // currency amount whose width, and therefore whose wrapping, depends on how
  // much the driver made.
  const [cardHeight, setCardHeight] = useState(0);
  const onCardLayout = useCallback((height: number) => {
    setCardHeight((current) => (height > current ? height : current));
  }, []);

  const total = cards.length;
  const deckHeight = cardHeight > 0 ? cardHeight + (total - 1) * PEEK : undefined;

  return (
    <View style={[{ height: deckHeight }, style]}>
      {cards.map((card) => (
        <DeckCard
          key={card.key}
          card={card}
          depth={depths.get(card.key) ?? 0}
          total={total}
          reduced={reduced}
          theme={theme}
          onCardLayout={onCardLayout}
          onBringToFront={() => bringToFront(card.key)}
        />
      ))}
    </View>
  );
}

function DeckCard({
  card,
  depth,
  total,
  reduced,
  theme,
  onCardLayout,
  onBringToFront,
}: {
  card: HeroDeckCard;
  depth: number;
  total: number;
  reduced: boolean;
  theme: Theme;
  onCardLayout: (height: number) => void;
  onBringToFront: () => void;
}) {
  const animated = useRef(new Animated.Value(depth)).current;
  const front = depth === 0;
  const ink = inkFor(theme, card.tone);
  const ratio = card.progress === undefined ? null : Math.max(0, Math.min(1, card.progress));

  useEffect(() => {
    if (reduced) {
      animated.setValue(depth);
      return;
    }
    // A spring, not a timing curve: cards have weight, and the small overshoot
    // is what reads as one being laid on top of the others rather than
    // cross-fading into place.
    const animation = Animated.spring(animated, {
      toValue: depth,
      friction: 9,
      tension: 70,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, depth, reduced]);

  // Depth 0 sits lowest, with every card behind it stepped up by one PEEK. The
  // deck therefore grows upwards from the front card, which keeps the figure
  // in the same place on the screen no matter which card is showing.
  const range = total > 1 ? [0, total - 1] : [0, 1];
  const top = animated.interpolate({
    inputRange: range,
    outputRange: [(total - 1) * PEEK, 0],
  });
  const inset = animated.interpolate({
    inputRange: range,
    outputRange: [0, (total - 1) * STEP_INSET],
  });

  return (
    <Animated.View
      // The whole card, strip and progress bar included — not just the body.
      // The deck reserves the tallest card's height, and measuring a part of
      // it leaves whatever follows on the screen sitting that much too close.
      onLayout={(event) => onCardLayout(event.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        top,
        left: inset,
        right: inset,
        // Not animated on purpose: the card being pulled out has to be drawn
        // over the others from the first frame, or it travels underneath them.
        zIndex: total - depth,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          front ? (card.actionLabel ?? card.title) : `Ver ${card.title}, ${card.summary}`
        }
        onPress={front ? card.onPress : onBringToFront}
        // A card with nowhere to go, already in front, is not a button.
        disabled={front && !card.onPress}
      >
        {({ pressed }) => (
          <Gradient
            colors={gradientFor(theme, card.tone)}
            direction={front ? 'diagonal' : 'horizontal'}
            radius={theme.radius['3xl']}
            style={[
              theme.elevation.lg,
              // Presses say so, per the motion rules. Not a transform: the card
              // is already carrying an animated position and stacking a second
              // one makes the two fight on the same frame.
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <View
              style={{
                height: PEEK,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.lg,
              }}
            >
              {card.titleIcon ? <Icon name={card.titleIcon} size={14} color={ink} /> : null}
              <Text variant="captionStrong" style={{ color: ink }} numberOfLines={1}>
                {card.title}
              </Text>
              <Text
                variant="captionStrong"
                style={{ color: ink, marginLeft: 'auto' }}
                numberOfLines={1}
              >
                {card.summary}
              </Text>
            </View>

            {ratio === null ? null : (
              // Inset past the corner radius and drawn on a track. Hard against
              // the corner and with no track behind it, a bar a tenth of the
              // way along was clipped into a dark stub that read as a smudge on
              // the card rather than as progress.
              <View
                style={{
                  height: BAR,
                  marginHorizontal: theme.spacing.lg,
                  borderRadius: theme.radius.pill,
                  overflow: 'hidden',
                  backgroundColor: ink,
                  opacity: 0.25,
                }}
              >
                <View
                  style={{
                    height: BAR,
                    width: `${Math.round(ratio * 100)}%`,
                    borderRadius: theme.radius.pill,
                    backgroundColor: ink,
                  }}
                />
              </View>
            )}

            <View
              style={{
                padding: theme.spacing.xl,
                paddingTop: theme.spacing.lg,
                gap: theme.spacing.lg,
              }}
            >
              <View style={{ gap: theme.spacing.xxs }}>
                <Text variant="caption" style={{ color: ink, opacity: 0.85 }}>
                  {card.label}
                </Text>
                {card.children}
              </View>

              {card.details && card.details.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
                  {card.details.map((detail) => (
                    <View key={detail.label} style={{ gap: 2 }}>
                      <Text variant="caption" style={{ color: ink, opacity: 0.8 }}>
                        {detail.label}
                      </Text>
                      <Text variant="bodyStrong" style={{ color: ink }}>
                        {detail.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Gradient>
        )}
      </Pressable>
    </Animated.View>
  );
}
