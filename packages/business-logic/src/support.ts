import type {
  SupportPriority,
  SupportTicketStatus,
  Timestamp,
} from '@dinamique/types';

/**
 * Support ticket state machine (§69, §74). Status changes are derived from
 * events rather than set freehand, so the inbox counters cannot drift.
 */

export type SupportEvent =
  | { type: 'created' }
  | { type: 'user_replied' }
  | { type: 'agent_replied' }
  | { type: 'assigned' }
  | { type: 'resolved' }
  | { type: 'closed' }
  | { type: 'reopened' };

const TERMINAL: ReadonlySet<SupportTicketStatus> = new Set(['closed']);

export function nextTicketStatus(
  current: SupportTicketStatus,
  event: SupportEvent,
): SupportTicketStatus {
  // A closed ticket only moves again through an explicit reopen.
  if (TERMINAL.has(current) && event.type !== 'reopened') return current;

  switch (event.type) {
    case 'created':
      return 'new';
    case 'assigned':
      return current === 'new' ? 'awaiting_agent' : current;
    case 'agent_replied':
      return 'awaiting_user';
    case 'user_replied':
      // A user writing back always pulls the ticket into the team's queue.
      return current === 'resolved' ? 'awaiting_agent' : 'in_progress';
    case 'resolved':
      return 'resolved';
    case 'closed':
      return 'closed';
    case 'reopened':
      return 'awaiting_agent';
  }
}

/** Statuses the team still owes an answer on — drives the "não respondidos" badge. */
export const UNANSWERED_STATUSES: readonly SupportTicketStatus[] = [
  'new',
  'awaiting_agent',
  'in_progress',
];

export function isAwaitingTeam(status: SupportTicketStatus): boolean {
  return UNANSWERED_STATUSES.includes(status);
}

export function isOpen(status: SupportTicketStatus): boolean {
  return status !== 'resolved' && status !== 'closed';
}

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  new: 'Novo',
  awaiting_agent: 'Aguardando atendimento',
  in_progress: 'Em atendimento',
  awaiting_user: 'Aguardando você',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export const PRIORITY_LABELS: Record<SupportPriority, string> = {
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export interface TicketTimings {
  createdAt: Timestamp;
  firstAgentReplyAt: Timestamp | null;
  resolvedAt: Timestamp | null;
}

/** Seconds to first response; null while unanswered (§92). */
export function timeToFirstResponse(t: TicketTimings): number | null {
  if (!t.firstAgentReplyAt) return null;
  return Math.max(0, Math.round((Date.parse(t.firstAgentReplyAt) - Date.parse(t.createdAt)) / 1000));
}

export function timeToResolution(t: TicketTimings): number | null {
  if (!t.resolvedAt) return null;
  return Math.max(0, Math.round((Date.parse(t.resolvedAt) - Date.parse(t.createdAt)) / 1000));
}

/** Mean of the defined values only — unanswered tickets are excluded, not zeroed. */
export function averageSeconds(values: readonly (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length === 0) return null;
  return Math.round(defined.reduce((a, b) => a + b, 0) / defined.length);
}

/**
 * Human-facing reference like `DNQ-1042`. The number exists for the team; the
 * app shows it discreetly rather than making the driver quote it (§69).
 */
export function formatTicketReference(sequence: number): string {
  return `DNQ-${String(sequence).padStart(4, '0')}`;
}
