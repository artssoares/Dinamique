import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, darkTokens, IconButton, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { FilmPlayer } from '@/features/film/FilmPlayer';
import { useJourneyFilm } from '@/features/film/useJourneyFilm';

/**
 * O filme do dia, em tela cheia, por endereço.
 *
 * É por onde o resumo do encerramento chega ao filme. No Histórico o filme
 * já está tocando no cartão do dia e cresce para a tela cheia ali mesmo, sem
 * trocar de tela; esta rota existe para quem chega de fora dele.
 *
 * A tela é escura de ponta a ponta e não segue o tema do aplicativo. É
 * deliberado: o que está no meio dela não é uma tela, é um filme, e um filme
 * emoldurado de branco perde metade do impacto. As cores vêm dos tokens do
 * tema escuro, nunca de um hex digitado aqui.
 */
export default function JourneyFilm() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const journeyId = typeof id === 'string' ? id : null;

  const film = useJourneyFilm(journeyId);
  const hasRoute = film.recap?.hasRoute ?? false;

  useEffect(() => {
    if (film.recap) {
      void track('journey_film_viewed', { journey_id: journeyId, has_route: hasRoute, surface: 'full' });
    }
  }, [film.recap, hasRoute, journeyId]);

  if (film.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: darkTokens.backgroundPrimary, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md }}>
          <IconButton icon="chevronLeft" label="Voltar" tone="surface" onPress={() => router.back()} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
          <ActivityIndicator color={darkTokens.textPrimary} />
          <Text variant="caption" style={{ color: darkTokens.textSecondary }}>
            Montando o filme do seu dia
          </Text>
        </View>
      </View>
    );
  }

  if (film.notFound || film.unfinished || !film.recap || !film.preview) {
    return (
      <Screen header={<ScreenHeader title="Filme do dia" onBack={() => router.back()} />} center>
        <Card padding="xl" style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">
            {film.unfinished ? 'Esta jornada ainda está aberta' : 'Jornada não encontrada'}
          </Text>
          <Text variant="body" color="secondary">
            {film.unfinished
              ? 'O filme é montado quando a jornada é encerrada. Só o que fechou entra na conta.'
              : 'Talvez ela tenha sido apagada. Volte ao histórico e escolha outro dia.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <FilmPlayer
      journeyId={journeyId ?? ''}
      recap={film.recap}
      playing={film.preview}
      hasRoute={hasRoute}
      trimmed={film.trimmed}
      onClose={() => router.back()}
    />
  );
}
