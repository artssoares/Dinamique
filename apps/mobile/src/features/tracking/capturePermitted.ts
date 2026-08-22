import { supabase } from '@/lib/supabase';

/**
 * Does the driver still want us counting?
 *
 * A plain function rather than the preferences hook, because the two callers
 * are lifecycle paths — reboot recovery and resuming after the close wizard —
 * that run outside any render and must not depend on a hook's loaded state.
 *
 * The OS permission is not consent. Nothing clears the buffer's active-route
 * key when someone switches capture off in the settings, so a path that asked
 * only the operating system would happily resurrect tracking after the driver
 * withdrew it.
 *
 * Returns `null` when the question could not be answered. Callers must not act
 * on that as either a yes or a no: recording someone against their word is
 * unacceptable, and treating one network blip as a refusal would abandon
 * capture for the rest of a shift that is still running.
 */
export async function capturePermitted(): Promise<boolean | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('route_capture_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return Boolean(data?.route_capture_enabled);
}
