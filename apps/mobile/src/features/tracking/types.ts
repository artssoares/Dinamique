import type { Fix } from '@dinamique/business-logic';

/**
 * The capture layer's contract, implemented once per platform.
 *
 * `locationService.ts` is the web implementation and `locationService.native.ts`
 * overrides it on device. That direction matters: TypeScript knows nothing about
 * Metro's platform extensions, so the bare `.ts` has to be a real module the
 * compiler can resolve. Making it the web one means tsc, the web bundler and the
 * native bundler all agree, and — the point of the whole arrangement — the web
 * dependency graph never contains MapLibre or expo-task-manager.
 */
export interface LocationService {
  /** Whether background capture is even possible here. False on the web. */
  readonly supportsBackground: boolean;
  /** True once the OS is feeding us positions for this journey. */
  isTracking(): Promise<boolean>;
  start(journeyId: string): Promise<void>;
  stop(): Promise<void>;
}

export type PermissionStage = 'foreground' | 'background' | 'services_off';

export interface PermissionOutcome {
  granted: boolean;
  /** True when the OS is also willing to report positions with the app closed. */
  background: boolean;
  /** Which step said no, for the analytics event and the honest UI copy. */
  deniedAt: PermissionStage | null;
}

export type { Fix };
