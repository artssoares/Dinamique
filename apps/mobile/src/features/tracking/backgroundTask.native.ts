import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { appendFixes, getActiveRoute } from './buffer';
import { LOCATION_TASK } from './constants';
import { toFix } from './fix';

/**
 * The headless half of capture.
 *
 * This has to run at module scope, and the module has to be imported from the
 * root layout, because iOS relaunches the app in the background for location
 * events and re-runs registrations — but only ones it finds while the JS bundle
 * is being evaluated. Registering inside a component or an effect would work
 * right up until the driver switched apps, which is the entire point.
 *
 * It writes to storage and nothing else. No network, no Supabase client, no
 * React: this executes in a context where the app may not be running at all.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const locations = (data as { locations?: LocationObject[] } | null)?.locations;
  if (!locations || locations.length === 0) return;

  try {
    // The task outlives any particular journey, so it asks storage which
    // journey it is filling rather than trusting a variable from a previous
    // launch.
    const active = await getActiveRoute();
    if (!active) return;

    await appendFixes(active.journeyId, locations.map(toFix));
  } catch {
    // The buffer deliberately throws rather than mistaking an unreadable key
    // for an empty one, so this can reject — and a rejection in a headless
    // task is an unhandled rejection with no screen to show it on. Dropping
    // one batch of fixes is the right cost; the next batch tries again.
  }
});
