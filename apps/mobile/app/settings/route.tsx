import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { runningJourneyId } from '@/features/journey/runningJourneyId';
import { locationService } from '@/features/tracking/locationService';
import {
  currentPermission,
  PERMISSION_COPY,
  requestForeground,
} from '@/features/tracking/permission';
import { RETENTION_CHOICES, useRoutePreferences } from '@/features/tracking/preferences';

/**
 * Trajeto e privacidade.
 *
 * Everything about route capture that is the driver's decision lives on one
 * screen: whether we measure at all, what we hide when they share, how long we
 * keep it, and a button that erases the lot. A feature that quietly records
 * where someone goes has to be this easy to turn off, or it should not ship.
 */
export default function RouteSettings() {
  const theme = useTheme();
  const router = useRouter();
  const { preferences, update, deleteAllRoutes } = useRoutePreferences();
  const [deleting, setDeleting] = useState(false);

  async function toggleCapture(next: boolean) {
    // The switch reverts itself when the write fails, so acting anyway would
    // leave the OS recording while the UI — and `capturePermitted()` — both
    // said capture was off.
    if (!(await update({ captureEnabled: next, prompted: true }))) {
      Alert.alert(
        'Não conseguimos salvar',
        'Sua escolha não foi gravada. Confira sua conexão e tente de novo.',
      );
      return;
    }

    if (!next) {
      // Turning it off has to stop what is running. Writing the preference
      // alone would leave a shift still being recorded by the OS, which is
      // exactly what the driver just said they did not want.
      await locationService.stop();
      return;
    }

    void track('route_capture_enabled', { source: 'settings' });

    // A switch that says "on" while nothing is being recorded is a lie the
    // driver only discovers at the end of the day, so the permission is asked
    // for here and its absence is reported.
    let permission = await currentPermission();
    if (!permission.granted) permission = await requestForeground();

    if (!permission.granted) {
      await update({ captureEnabled: false });
      Alert.alert(
        'Precisamos da localização',
        permission.deniedAt === 'services_off'
          ? PERMISSION_COPY.servicesOff
          : 'Libere o acesso à localização nos ajustes do celular para o Dinamique contar seus km.',
      );
      return;
    }

    // Switched on with a shift already open: start counting the rest of it
    // rather than making the driver close and reopen the journey. The buffer
    // resumes if one exists, so a shift toggled off and on keeps its start.
    const journeyId = await runningJourneyId();
    if (!journeyId) return;

    try {
      await locationService.start(journeyId);
    } catch {
      await update({ captureEnabled: false });
      Alert.alert(
        'Não conseguimos começar a contar',
        'O sistema recusou o acesso à localização. Verifique a permissão do Dinamique nos ajustes do celular.',
      );
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Apagar todos os meus trajetos?',
      'Some com o desenho de todos os caminhos, aqui e no aparelho. Os km e o dinheiro continuam no seu histórico. Isso não tem como desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            // A destructive button that spins for ever is worse than one that
            // reports failure: the driver cannot tell whether it worked.
            let done = false;
            try {
              done = await deleteAllRoutes();
            } catch {
              done = false;
            } finally {
              setDeleting(false);
            }
            Alert.alert(
              done ? 'Pronto' : 'Algo não terminou',
              done
                ? 'Seus trajetos foram apagados.'
                : 'Confira sua conexão e tente de novo. Se você estiver em jornada, encerre e comece outra para voltar a contar os km.',
            );
          },
        },
      ],
    );
  }

  return (
    <Screen
      header={<ScreenHeader title="Trajeto e privacidade" onBack={() => router.back()} />}
      gap="lg"
    >
      <Card padding="xl" style={{ gap: theme.spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text variant="bodyStrong">Contar meus km pelo GPS</Text>
          </View>
          <Switch
            value={preferences.captureEnabled}
            onValueChange={(next) => void toggleCapture(next)}
          />
        </View>
        <Text variant="caption" color="muted">
          Enquanto a jornada estiver aberta, o Dinamique acompanha o trajeto só para somar a
          quilometragem. Com isso desligado, você digita os km na mão como sempre.
        </Text>
        <Text variant="caption" color="muted">
          Isso usa mais bateria. Se ficar pesado no seu aparelho, é só desligar aqui.
        </Text>
      </Card>

      <Card padding="xl" style={{ gap: theme.spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text variant="bodyStrong">Esconder o começo e o fim</Text>
          </View>
          <Switch
            value={preferences.trimShared}
            onValueChange={(next) => void update({ trimShared: next })}
          />
        </View>
        <Text variant="caption" color="muted">
          Ao compartilhar, cortamos até 500 metros do começo e do fim do desenho — em trajetos
          curtos cortamos menos, para o caminho ainda fazer sentido. Assim ninguém descobre onde
          você mora pela imagem. Recomendado.
        </Text>
      </Card>

      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="bodyStrong">Guardar os trajetos por</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {RETENTION_CHOICES.map((choice) => (
            <Chip
              key={String(choice.value)}
              label={choice.label}
              selected={preferences.retentionDays === choice.value}
              onPress={() => void update({ retentionDays: choice.value })}
            />
          ))}
        </View>
        <Text variant="caption" color="muted">
          Passado esse tempo, o desenho do caminho some sozinho. Os km e o dinheiro daquele dia
          continuam no histórico.
        </Text>
      </Card>

      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="bodyStrong">Apagar todos os meus trajetos</Text>
        <Text variant="caption" color="muted">
          Some com o desenho de todos os caminhos já gravados, aqui e no seu aparelho. Seus
          ganhos, gastos e quilometragem não são afetados.
        </Text>
        <Button
          label="Apagar meus trajetos"
          variant="danger"
          iconName="alert"
          loading={deleting}
          onPress={confirmDelete}
        />
      </Card>

      <Text variant="caption" color="muted">
        Seu trajeto nunca entra nas comparações com outros motoristas e nunca sai da sua conta.
      </Text>
    </Screen>
  );
}
