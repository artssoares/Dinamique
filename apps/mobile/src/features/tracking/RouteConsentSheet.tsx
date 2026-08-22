import { View } from 'react-native';
import { Button, Sheet, Text, useTheme } from '@dinamique/ui';
import { PERMISSION_COPY } from './permission';

/**
 * Our ask, in Portuguese, before the operating system's.
 *
 * A system permission dialog is a one-shot resource: a driver who taps "não
 * permitir" on a box they did not understand has spent it, and getting it back
 * means a trip into the phone's settings. So we explain first, in the app's own
 * voice, and only reach for the real dialog once someone has said yes here.
 *
 * "Agora não" is a real answer. It does not come back on its own — the setting
 * in Mais › Trajeto e privacidade is where someone changes their mind.
 */
export function RouteConsentSheet({
  visible,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} onClose={onDecline} title={PERMISSION_COPY.rationaleTitle}>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body" color="secondary">
          {PERMISSION_COPY.rationaleBody}
        </Text>
        <Text variant="caption" color="muted">
          {PERMISSION_COPY.rationaleFooter}
        </Text>
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <Button label="Ativar" size="lg" fullWidth iconName="route" onPress={onAccept} />
          <Button label="Agora não" variant="ghost" fullWidth onPress={onDecline} />
        </View>
      </View>
    </Sheet>
  );
}

/**
 * The second ask, shown only once a journey is already running and visibly
 * counting. Declining leaves foreground capture working, which is why the
 * dismissive action here says "só com o app aberto" rather than "cancelar".
 */
export function BackgroundConsentSheet({
  visible,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} onClose={onDecline} title={PERMISSION_COPY.backgroundTitle}>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body" color="secondary">
          {PERMISSION_COPY.backgroundBody}
        </Text>
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <Button label="Permitir" size="lg" fullWidth onPress={onAccept} />
          <Button label="Só com o app aberto" variant="ghost" fullWidth onPress={onDecline} />
        </View>
      </View>
    </Sheet>
  );
}
