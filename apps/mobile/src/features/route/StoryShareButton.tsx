import { useMemo, useRef, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import type Svg from 'react-native-svg';
import type { Cents, DateOnly, Metres, Seconds } from '@dinamique/types';
import { trimRouteEnds } from '@dinamique/business-logic';
import type { LatLng } from '@dinamique/types';
import { Button, StoryCard, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useRoutePreferences } from '@/features/tracking/preferences';
import { longDateLabel } from './routeDates';
import { storyFigures } from './storyFigures';
import { captureStory, deliverStory } from './storyShare';

export interface StoryShareButtonProps {
  points: readonly LatLng[];
  date: DateOnly;
  distance: Metres | null;
  workedSeconds: Seconds;
  revenuePerKm: Cents | null;
  grossRevenue: Cents;
}

/**
 * "Compartilhar meu trajeto".
 *
 * The card is mounted off-screen the whole time rather than on demand: the
 * capture reads a laid-out node, and a component that mounts and captures in
 * the same tick catches an empty one. Off-screen and always there costs one
 * SVG that nobody scrolls past.
 */
export function StoryShareButton({
  points,
  date,
  distance,
  workedSeconds,
  revenuePerKm,
  grossRevenue,
}: StoryShareButtonProps) {
  const theme = useTheme();
  const { preferences } = useRoutePreferences();
  const cardRef = useRef<Svg>(null);
  const [sharing, setSharing] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);

  /**
   * The route as it leaves the phone, which is not the route on screen.
   *
   * The replay inside the app shows the whole day — it is the driver looking
   * at their own shift on their own device, and cropping it there would be
   * confusing and a little paternalistic. The image is different: it goes to
   * people who do not already know where this person lives, and the first and
   * last few hundred metres of a driver's day are their front door.
   */
  const shared = useMemo(
    () => (preferences.trimShared ? trimRouteEnds(points) : [...points]),
    [points, preferences.trimShared],
  );

  const figures = useMemo(
    () =>
      storyFigures({
        distance,
        workedSeconds,
        revenuePerKm,
        grossRevenue: showEarnings ? grossRevenue : null,
      }),
    [distance, workedSeconds, revenuePerKm, grossRevenue, showEarnings],
  );

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      const base64 = await captureStory(cardRef.current);
      if (!base64) {
        Alert.alert(
          'Não conseguimos montar a imagem',
          'Tente de novo em instantes. Seus dados estão salvos normalmente.',
        );
        return;
      }

      const result = await deliverStory(base64, `dinamique-${date}.png`);
      if (!result.ok) {
        Alert.alert('Não conseguimos compartilhar', result.reason ?? 'Tente de novo em instantes.');
        return;
      }

      void track('route_story_shared', { trimmed: preferences.trimShared, earnings: showEarnings });
    } catch {
      Alert.alert(
        'Não conseguimos compartilhar',
        'Tente de novo em instantes. Seus dados estão salvos normalmente.',
      );
    } finally {
      setSharing(false);
    }
  }

  // Trimming can legitimately leave nothing to show — a three-kilometre day
  // is mostly its own two ends. Better no button than a button that produces
  // an empty card.
  if (shared.length < 2) return null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Button
        label="Compartilhar meu trajeto"
        size="lg"
        fullWidth
        iconName="arrowUpRight"
        loading={sharing}
        onPress={() => void share()}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body">Mostrar quanto ganhei</Text>
          {/*
            Off by default, and it stays a decision rather than a setting we
            make for them. A story that says how much cash somebody finished
            the night with, from an account that shows the city they drive in,
            is not a thing to opt people into.
          */}
          <Text variant="caption" color="muted">
            Desligado, a imagem mostra só os km, o tempo e o valor por km.
          </Text>
        </View>
        <Switch
          value={showEarnings}
          onValueChange={setShowEarnings}
          accessibilityLabel="Mostrar quanto ganhei na imagem"
        />
      </View>

      {preferences.trimShared ? (
        <Text variant="caption" color="muted">
          Cortamos o começo e o fim do trajeto na imagem. Dá para mudar isso em Trajeto e
          privacidade.
        </Text>
      ) : null}

      {/*
        Fora da tela, mas com layout: a captura lê um nó já medido, e um card
        montado no mesmo instante em que é capturado sai vazio.
      */}
      <View
        style={{ position: 'absolute', left: -10_000, top: 0 }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StoryCard ref={cardRef} points={shared} figures={figures} date={longDateLabel(date)} />
      </View>
    </View>
  );
}
