import { isAwaitingTeam } from '@dinamique/business-logic';
import { Sidebar } from '@/components/Sidebar';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

/**
 * Every page under this layout sits behind `requireAdmin()`, which runs on the
 * server for each request. The sidebar is only chrome – it hides links a role
 * cannot use, but each page re-checks its own permission (§118).
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const supabase = await getSessionClient();

  // Live counter of tickets the team still owes an answer (§75), and of the
  // problems nobody has triaged yet. Both live in the sidebar because they are
  // the two things that go stale while nobody is looking.
  const [tickets, errors] = await Promise.all([
    supabase.from('support_tickets').select('status'),
    supabase.from('app_errors').select('id', { count: 'exact', head: true }).in('status', ['new', 'investigating']),
  ]);

  const unanswered = ((tickets.data as { status: string }[] | null) ?? []).filter((ticket) =>
    isAwaitingTeam(ticket.status as never),
  ).length;

  return (
    <div className="layout">
      <Sidebar
        role={admin.role}
        name={admin.name}
        unansweredTickets={unanswered}
        openErrors={errors.count ?? 0}
      />
      <main className="content">{children}</main>
    </div>
  );
}
