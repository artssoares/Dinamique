import { supabase } from '@/lib/supabase';

/**
 * The id of the journey currently running.
 *
 * A plain query rather than the journey hook, because the callers are places —
 * the settings screen, the delete-everything path — that have no business
 * subscribing to journey state to answer one question. A unique partial index
 * makes "the" running journey well defined.
 *
 * Deliberately excludes a paused journey. Every caller uses this to decide
 * whether to start counting, and counting through a break puts the kilometres
 * driven to lunch into the distance while the same minutes stay out of the
 * worked time — which skews every per-km figure in the product.
 */
export async function runningJourneyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;

  const { data } = await supabase
    .from('journeys')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return data ? String(data.id) : null;
}

/**
 * The id of the journey that is open, running or paused.
 *
 * Distinct from `runningJourneyId()` on purpose. "Should we be counting?" is a
 * question about a *running* journey — a break is not a gap to fill in. "Is
 * there a shift in progress whose data must be left alone?" is a question
 * about an *open* one, and a driver on their lunch break still has a morning
 * on the device that nothing should throw away.
 */
export async function openJourneyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;

  const { data } = await supabase
    .from('journeys')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  return data ? String(data.id) : null;
}
