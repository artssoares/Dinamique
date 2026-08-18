import { isAwaitingTeam } from '@dinamique/business-logic';
import { Sidebar } from '@/components/Sidebar';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

/**
 * Every page under this layout sits behind `requireAdmin()`, which runs on the
 * server for each request. The sidebar is only chrome — it hides links a role
 * cannot use, but each page re-checks its own permission (§118).
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const supabase = await getSessionClient();

  // Live counter of tickets the team still owes an answer (§75).
  const { data } = await supabase.from('support_tickets').select('status');
  const unanswered = ((data as { status: string }[] | null) ?? []).filter((ticket) =>
    isAwaitingTeam(ticket.status as never),
  ).length;

  return (
    <div className="layout">
      <Sidebar role={admin.role} name={admin.name} unansweredTickets={unanswered} />
      <main className="content">{children}</main>
    </div>
  );
}
