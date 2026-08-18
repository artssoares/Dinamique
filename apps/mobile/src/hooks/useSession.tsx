import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import type { PlanCode, ThemePreference } from '@dinamique/types';
import { supabase } from '../lib/supabase';

/**
 * Session, profile and effective plan in one place. Every screen reads plan
 * gating from here so no component decides for itself what Pro means (§56).
 */

export interface SessionProfile {
  id: string;
  firstName: string;
  preferredName: string | null;
  avatarPath: string | null;
  workModes: string[];
  onboardingCompletedAt: string | null;
  theme: ThemePreference;
}

interface SessionState {
  session: Session | null;
  profile: SessionProfile | null;
  plan: PlanCode;
  isTrial: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [plan, setPlan] = useState<PlanCode>('free');
  const [isTrial, setIsTrial] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const [profileResult, planResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, preferred_name, avatar_path, work_modes, onboarding_completed_at, user_preferences(theme)')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('current_plans').select('plan, is_trial').eq('user_id', userId).maybeSingle(),
    ]);

    const row = profileResult.data as
      | (Record<string, unknown> & { user_preferences?: { theme?: ThemePreference } | null })
      | null;

    setProfile(
      row
        ? {
            id: String(row.id),
            firstName: String(row.first_name ?? ''),
            preferredName: (row.preferred_name as string | null) ?? null,
            avatarPath: (row.avatar_path as string | null) ?? null,
            workModes: (row.work_modes as string[] | null) ?? [],
            onboardingCompletedAt: (row.onboarding_completed_at as string | null) ?? null,
            theme: row.user_preferences?.theme ?? 'system',
          }
        : null,
    );

    setPlan(((planResult.data?.plan as PlanCode | undefined) ?? 'free'));
    setIsTrial(Boolean(planResult.data?.is_trial));
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) {
        await loadProfile(next.user.id);
      } else {
        setProfile(null);
        setPlan('free');
        setIsTrial(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Records the visit so the admin panel's "último acesso" is real (§84).
  useEffect(() => {
    if (!session?.user) return;
    void supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.user.id);
  }, [session?.user?.id]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      profile,
      plan,
      isTrial,
      loading,
      refresh: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, plan, isTrial, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a <SessionProvider>.');
  return context;
}
