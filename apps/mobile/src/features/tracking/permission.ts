import * as Location from 'expo-location';
import { locationService } from './locationService';
import type { PermissionOutcome } from './types';

/**
 * Asking for location, in the order the platforms actually reward.
 *
 * Two rules drive the shape of this:
 *
 *  - iOS silently downgrades a cold "Always" request, and App Store review
 *    rejects one made before the feature it serves is visible. So background is
 *    only ever requested after a journey has already started and the driver has
 *    seen the app counting.
 *  - A system dialog is a one-shot resource. Ours is the sheet that comes
 *    before it (RouteConsentSheet), which is why nothing here renders anything.
 *
 * Every call is wrapped. The web shim throws outright where
 * `navigator.permissions.query({ name: 'geolocation' })` is unsupported —
 * Safari — and an unhandled rejection would leave the preference reading "on"
 * with nothing recording and nothing said.
 */

/** The copy the OS shows. Kept beside the calls so the two never drift apart. */
export const PERMISSION_COPY = {
  rationaleTitle: 'Quer que o Dinamique conte seus km sozinho?',
  rationaleBody:
    'Enquanto a jornada estiver aberta, o aplicativo acompanha o trajeto só para somar a quilometragem.',
  rationaleFooter:
    'Você continua podendo digitar os km na mão, e pode desligar isso quando quiser em Mais › Trajeto e privacidade.',
  backgroundTitle: 'Contar mesmo com o celular no bolso',
  backgroundBody:
    'Para continuar somando com a tela desligada ou em outro aplicativo, o sistema pede a permissão “Sempre”.',
  servicesOff:
    'A localização do aparelho está desligada. Ligue nos ajustes do celular para o Dinamique contar seus km.',
} as const;

export async function requestForeground(): Promise<PermissionOutcome> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { granted: false, background: false, deniedAt: 'services_off' };
    }

    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted
      ? { granted: true, background: false, deniedAt: null }
      : { granted: false, background: false, deniedAt: 'foreground' };
  } catch {
    return { granted: false, background: false, deniedAt: 'foreground' };
  }
}

/**
 * The second ask. Never call this before the journey is running.
 *
 * Denial is not a failure: capture keeps working while the app is open, and the
 * journey card says so rather than pretending otherwise.
 */
export async function requestBackground(): Promise<PermissionOutcome> {
  try {
    const { granted } = await Location.requestBackgroundPermissionsAsync();
    return granted
      ? { granted: true, background: true, deniedAt: null }
      : { granted: true, background: false, deniedAt: 'background' };
  } catch {
    return { granted: true, background: false, deniedAt: 'background' };
  }
}

/**
 * What we already hold, without prompting for anything.
 *
 * Includes the device switch, not just the app grant. A phone with location
 * turned off reports the permission as granted and then reports no positions,
 * so a caller trusting the grant alone would start capture, record nothing,
 * and tell the driver it was counting.
 */
export async function currentPermission(): Promise<PermissionOutcome> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { granted: false, background: false, deniedAt: 'services_off' };
    }

    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      return { granted: false, background: false, deniedAt: 'foreground' };
    }

    // A browser tab cannot follow a driver with the screen off, whatever the
    // shim reports — and on the web it reports the *foreground* result rather
    // than refusing, so trusting it would stop the journey card from saying
    // "só com o app aberto" exactly where that warning matters most.
    if (!locationService.supportsBackground) {
      return { granted: true, background: false, deniedAt: null };
    }

    const background = await Location.getBackgroundPermissionsAsync();
    return { granted: true, background: background.granted, deniedAt: null };
  } catch {
    return { granted: false, background: false, deniedAt: 'foreground' };
  }
}
