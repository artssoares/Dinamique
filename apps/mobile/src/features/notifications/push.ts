import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Push Notifications (§59).
 *
 * O Push é um canal ADICIONAL: a notificação interna funciona sozinha, e o
 * aplicativo continua inteiro se o usuário recusar a permissão.
 *
 * Não pedimos permissão na abertura. Só quando o usuário liga a opção nas
 * preferências – pedir logo de cara costuma resultar em recusa permanente.
 */

export async function registerForPush(userId: string): Promise<string | null> {
  // Emulador não recebe push; pedir permissão ali só gera confusão.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Dinamique',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();

  await supabase
    .from('user_preferences')
    .update({ push_token: token.data, push_enabled: true })
    .eq('user_id', userId);

  return token.data;
}

export async function disablePush(userId: string): Promise<void> {
  await supabase
    .from('user_preferences')
    .update({ push_enabled: false, push_token: null })
    .eq('user_id', userId);
}

/** Abre a tela que a notificação aponta quando o usuário toca nela. */
export function deepLinkFromNotification(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as { deepLink?: unknown };
  return typeof data?.deepLink === 'string' ? data.deepLink : null;
}
