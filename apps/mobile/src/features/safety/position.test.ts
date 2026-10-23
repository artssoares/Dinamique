import { beforeEach, describe, expect, it, vi } from 'vitest';

const getForegroundPermissionsAsync = vi.fn();
const requestForegroundPermissionsAsync = vi.fn();
const getCurrentPositionAsync = vi.fn();
const getLastKnownPositionAsync = vi.fn();

vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: () => getForegroundPermissionsAsync(),
  requestForegroundPermissionsAsync: () => requestForegroundPermissionsAsync(),
  getCurrentPositionAsync: (...args: unknown[]) => getCurrentPositionAsync(...args),
  getLastKnownPositionAsync: (...args: unknown[]) => getLastKnownPositionAsync(...args),
  Accuracy: { Balanced: 3 },
}));

vi.mock('@/features/tracking/locationService', () => ({
  locationService: { supportsBackground: true },
}));

function reading(lat: number, lon: number, accuracy: number | null = 12.4) {
  return { timestamp: 1_700_000_000_000, coords: { latitude: lat, longitude: lon, accuracy } };
}

let currentFix: typeof import('./position').currentFix;
let DEMO_POSITION: typeof import('./position').DEMO_POSITION;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  getLastKnownPositionAsync.mockResolvedValue(null);
  getCurrentPositionAsync.mockResolvedValue(reading(-23.1, -46.2));
  ({ currentFix, DEMO_POSITION } = await import('./position'));
});

describe('currentFix', () => {
  it('liga o GPS quando ninguém disse que um ponto guardado serve', async () => {
    const fix = await currentFix();

    expect(getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(getCurrentPositionAsync).toHaveBeenCalledOnce();
    expect(fix).toEqual({ lat: -23.1, lon: -46.2, accuracy: 12, demo: false });
  });

  it('não liga o GPS quando o sistema já tem um ponto recente', async () => {
    getLastKnownPositionAsync.mockResolvedValue(reading(-23.5, -46.6, 40));

    const fix = await currentFix({ prompt: false, maxAgeMs: 180_000 });

    expect(getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 180_000 });
    // O que esta linha protege é bateria: a batida da rede roda sozinha a cada
    // minuto e meio, o dia inteiro, e não pode acordar o rádio toda vez.
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(fix).toEqual({ lat: -23.5, lon: -46.6, accuracy: 40, demo: false });
  });

  it('cai para uma leitura nova quando não existe ponto guardado', async () => {
    const fix = await currentFix({ prompt: false, maxAgeMs: 180_000 });

    expect(getCurrentPositionAsync).toHaveBeenCalledOnce();
    expect(fix.demo).toBe(false);
  });

  it('não abre a caixa de permissão sem alguém ter tocado em nada', async () => {
    getForegroundPermissionsAsync.mockResolvedValue({ granted: false });

    const fix = await currentFix({ prompt: false, maxAgeMs: 180_000 });

    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(fix).toEqual(DEMO_POSITION);
  });

  it('um erro do sistema vira o ponto de demonstração, não uma tela parada', async () => {
    getForegroundPermissionsAsync.mockRejectedValue(new Error('sem Permissions API'));

    expect(await currentFix()).toEqual(DEMO_POSITION);
  });
});
