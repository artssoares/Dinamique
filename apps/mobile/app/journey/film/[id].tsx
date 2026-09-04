import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RecapMessage } from '@dinamique/recap';
import {
  Button,
  Card,
  darkTokens,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { FilmStage, type FilmStageHandle } from '@/features/film/FilmStage';
import { useJourneyFilm } from '@/features/film/useJourneyFilm';
import { useFilmVideo, type VideoPhase } from '@/features/film/useFilmVideo';

/**
 * O filme do dia: o trajeto sendo desenhado sobre o mapa, a câmera virando
 * com a rua, e o lucro no fim.
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

  const { recap, preview, loading, unfinished, notFound, trimmed } = useJourneyFilm(journeyId);
  const video = useFilmVideo({ journeyId: journeyId ?? '', hasRoute: recap?.hasRoute ?? false });

  const previewRef = useRef<FilmStageHandle>(null);
  const exportRef = useRef<FilmStageHandle>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (recap) {
      void track('journey_film_viewed', { journey_id: journeyId, has_route: recap.hasRoute });
    }
  }, [journeyId, recap]);

  /**
   * A gravação acontece num segundo palco, na resolução de arquivo, montado
   * por cima da prévia enquanto roda.
   *
   * Ele fica visível de propósito. Uma página escondida é pausada pelo
   * sistema: o `requestAnimationFrame` fora da tela cai para um quadro por
   * segundo, e o vídeo sairia assim. Mostrar o que está sendo gravado também
   * é a resposta honesta à pergunta "o que ele está fazendo com meu celular
   * por vinte segundos".
   */
  const handleExportMessage = useCallback(
    (message: RecapMessage) => {
      if (message.type === 'ready') {
        exportRef.current?.record();
        return;
      }
      video.handleMessage(message);
      if (message.type === 'done' || message.type === 'error') setRecording(false);
    },
    [video],
  );

  function startRecording() {
    if (!recap) return;
    previewRef.current?.pause();
    video.begin();
    setRecording(true);
  }

  function cancelRecording() {
    setRecording(false);
    video.reset();
    previewRef.current?.play();
  }

  if (loading) {
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

  if (notFound || unfinished || !recap || !preview) {
    return (
      <Screen header={<ScreenHeader title="Filme do dia" onBack={() => router.back()} />} center>
        <Card padding="xl" style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">
            {unfinished ? 'Esta jornada ainda está aberta' : 'Jornada não encontrada'}
          </Text>
          <Text variant="body" color="secondary">
            {unfinished
              ? 'O filme é montado quando a jornada é encerrada. Só o que fechou entra na conta.'
              : 'Talvez ela tenha sido apagada. Volte ao histórico e escolha outro dia.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: darkTokens.backgroundPrimary }}>
      {recording ? (
        <FilmStage key="export" ref={exportRef} recap={recap} mode="export" onMessage={handleExportMessage} />
      ) : (
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Tocar o filme de novo"
          onPress={() => previewRef.current?.play()}
        >
          <FilmStage key="preview" ref={previewRef} recap={preview} mode="preview" />
        </Pressable>
      )}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <IconButton
          icon="chevronLeft"
          label="Voltar"
          tone="surface"
          onPress={() => (recording ? cancelRecording() : router.back())}
        />
      </View>

      {recording ? <RecordingOverlay phase={video.phase} progress={video.progress} /> : null}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {video.error ? (
          <Notice icon="alert" text={video.error} />
        ) : !recap.hasRoute ? (
          // Dizer por que não há mapa é melhor que deixar a pessoa achar que
          // quebrou. E é onde a contagem por GPS é descoberta.
          <Notice
            icon="info"
            text="Sem trajeto nesta jornada. Ligue a contagem por GPS em Registrar para o próximo dia ter mapa."
          />
        ) : trimmed ? (
          <Notice icon="shield" text="As pontas do caminho foram cortadas, para não mostrar onde você começou e terminou." />
        ) : null}

        <Button
          label={recording ? labelFor(video.phase, video.progress) : 'Compartilhar vídeo'}
          size="lg"
          fullWidth
          iconName={recording ? undefined : 'arrowUpRight'}
          loading={recording && video.phase === 'sharing'}
          disabled={recording}
          onPress={startRecording}
        />

        {recording ? (
          <Button label="Cancelar" variant="ghost" size="sm" fullWidth onPress={cancelRecording} />
        ) : null}
      </View>
    </View>
  );
}

function labelFor(phase: VideoPhase, progress: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  switch (phase) {
    case 'preparing':
      return `Carregando o mapa: ${percent}%`;
    case 'rendering':
      return `Gravando: ${percent}%`;
    case 'encoding':
      return `Finalizando: ${percent}%`;
    case 'sharing':
      return 'Abrindo o compartilhamento';
    default:
      return 'Preparando';
  }
}

function Notice({ icon, text }: { icon: 'alert' | 'info' | 'shield'; text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        backgroundColor: darkTokens.surfacePrimary,
        borderRadius: theme.radius.xl,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Icon name={icon} size={16} color={darkTokens.textSecondary} />
      <Text variant="caption" style={{ color: darkTokens.textSecondary, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Um véu leve, não uma cortina.
 *
 * O que está sendo gravado continua visível porque é isso que a espera de
 * vinte segundos tem de bom: dá para assistir enquanto acontece.
 */
function RecordingOverlay({ phase, progress }: { phase: VideoPhase; progress: number }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 96 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          backgroundColor: darkTokens.surfacePrimary,
          borderRadius: theme.radius.pill,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: darkTokens.brandSecondary }} />
        <Text variant="captionStrong" style={{ color: darkTokens.textPrimary, letterSpacing: 0.6 }}>
          {phase === 'preparing' ? 'PREPARANDO' : 'GRAVANDO'}
        </Text>
      </View>
      <View
        style={{
          marginTop: theme.spacing.sm,
          height: 4,
          width: '70%',
          borderRadius: 999,
          backgroundColor: darkTokens.borderSubtle,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 4,
            borderRadius: 999,
            backgroundColor: darkTokens.brandSecondary,
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}
