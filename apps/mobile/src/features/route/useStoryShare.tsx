import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import type Svg from 'react-native-svg';
import type { Cents, DateOnly, LatLng, Metres, Seconds } from '@dinamique/types';
import { trimRouteEnds } from '@dinamique/business-logic';
import {
  Button,
  Sheet,
  STORY_HEIGHT,
  STORY_WIDTH,
  StoryCard,
  Text,
  useTheme,
} from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useRoutePreferences } from '@/features/tracking/preferences';
import { longDateLabel } from './routeDates';
import { storyFigures } from './storyFigures';
import { captureStory, deliverStory } from './storyShare';

export interface StoryShareInput {
  points: readonly LatLng[];
  date: DateOnly;
  distance: Metres | null;
  workedSeconds: Seconds;
  revenuePerKm: Cents | null;
}

export interface StoryShare {
  /** Opens the sheet. Always works — see `canShare`. */
  open: () => void;
  /**
   * Whether there is actually an image to post.
   *
   * False does not mean the tap does nothing: the sheet opens either way and
   * says why. It only decides whether the screen also shows a button, since a
   * button labelled "Compartilhar meu trajeto" that opens an explanation
   * instead is a small lie.
   */
  canShare: boolean;
  /** Render this once, anywhere in the screen. */
  sheet: ReactNode;
}

/** How wide the preview is allowed to be. A story is 1080 across. */
const PREVIEW_WIDTH = 250;

/**
 * "Compartilhar meu trajeto", as a sheet with the actual image in it.
 *
 * A hook rather than a button, because the tap that opens this comes from two
 * places: the button under the map and the map itself. The replay does not pan
 * or zoom, so the whole picture was dead space to a finger — and sharing the
 * day is the reason the picture exists. A driver who taps their route expects
 * something to happen.
 *
 * The sheet shows the real card, scaled, before anything leaves the phone.
 * Posting a picture of your own day to people you know is not a thing to do
 * blind: the earnings switch and the trimmed ends are decisions, and a
 * decision needs to be visible while you make it.
 */
export function useStoryShare({
  points,
  date,
  distance,
  workedSeconds,
  revenuePerKm,
}: StoryShareInput): StoryShare {
  const theme = useTheme();
  const { preferences } = useRoutePreferences();
  const cardRef = useRef<Svg>(null);
  // On the web the capture reads the DOM node rather than the component, so
  // it needs the wrapper as well as the card.
  const hostRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [sharing, setSharing] = useState(false);

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
    () => storyFigures({ distance, workedSeconds, revenuePerKm }),
    [distance, workedSeconds, revenuePerKm],
  );

  // Two different reasons there may be no image, and the driver has to be able
  // to tell them apart. Standing still is not the same problem as a short
  // shift, and neither of them is the app being broken — which is exactly what
  // a tap that did nothing used to look like.
  const nothingDriven = points.length < 2;
  const canShare = shared.length >= 2;

  const open = useCallback(() => setVisible(true), []);

  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const base64 = await captureStory(cardRef.current, hostRef.current);
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

      void track('route_story_shared', { trimmed: preferences.trimShared });
      setVisible(false);
    } catch {
      Alert.alert(
        'Não conseguimos compartilhar',
        'Tente de novo em instantes. Seus dados estão salvos normalmente.',
      );
    } finally {
      setSharing(false);
    }
  }, [date, preferences.trimShared, sharing]);

  const scale = PREVIEW_WIDTH / STORY_WIDTH;

  const sheet = !canShare ? (
    <Sheet
      visible={visible}
      onClose={() => setVisible(false)}
      title="Ainda não dá para compartilhar"
      description={
        nothingDriven
          ? 'Hoje o telefone ficou parado no mesmo lugar.'
          : 'O trajeto de hoje ficou perto de onde começou.'
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body">
          {nothingDriven
            ? 'A imagem do story é o desenho do seu caminho, e sem caminho não há o que desenhar. Rode alguns quilômetros com a jornada aberta e ela aparece aqui.'
            : 'A imagem nunca mostra onde você começou e terminou o dia, para ninguém descobrir onde você mora. Hoje o caminho inteiro ficou dentro dessa distância, então não dá para mostrar nada sem entregar o lugar.'}
        </Text>
        <Text variant="caption" color="muted">
          {nothingDriven
            ? 'Rode um pouco mais com a jornada aberta e o desenho aparece aqui.'
            : 'Um trajeto que se afaste um pouco mais do ponto de partida já aparece aqui.'}
        </Text>
      </View>
    </Sheet>
  ) : (
    <Sheet
      visible={visible}
      onClose={() => setVisible(false)}
      title="Seu trajeto de hoje"
      description="É isso que as pessoas vão ver."
      footer={
        <Button
          label="Compartilhar"
          size="lg"
          fullWidth
          iconName="arrowUpRight"
          loading={sharing}
          onPress={() => void share()}
        />
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center' }}>
          {/*
            The card at its real size, scaled down to fit. Not a second,
            smaller card built for the preview: what the driver approves has
            to be the thing that gets posted, down to the last pixel.

            Height is reserved for the scaled result, since a transform does
            not change how much room the node takes up in the layout.
          */}
          <View style={{ width: PREVIEW_WIDTH, height: STORY_HEIGHT * scale }}>
            <View
              ref={hostRef}
              // Without this Android flattens the wrapper away, and the web
              // capture has nothing to look inside for the card.
              collapsable={false}
              style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                transform: [{ scale }],
                transformOrigin: 'top left',
              }}
              pointerEvents="none"
            >
              <StoryCard
                ref={cardRef}
                points={shared}
                figures={figures}
                date={longDateLabel(date)}
              />
            </View>
          </View>
        </View>

        <Text variant="caption" color="muted">
          A imagem mostra os km, o tempo e o valor por km. Quanto você ganhou nunca entra.
        </Text>

        {preferences.trimShared ? (
          <Text variant="caption" color="muted">
            Cortamos o começo e o fim do trajeto na imagem, para ninguém descobrir onde você mora.
            Dá para mudar isso em Trajeto e privacidade.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );

  return { open, canShare, sheet };
}
