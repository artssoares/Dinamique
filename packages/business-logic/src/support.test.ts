import { describe, expect, it } from 'vitest';
import {
  averageSeconds,
  formatTicketReference,
  isAwaitingTeam,
  isOpen,
  nextTicketStatus,
  timeToFirstResponse,
  timeToResolution,
} from './support.js';

describe('nextTicketStatus', () => {
  it('opens as new', () => {
    expect(nextTicketStatus('new', { type: 'created' })).toBe('new');
  });

  it('queues the ticket when an agent takes it', () => {
    expect(nextTicketStatus('new', { type: 'assigned' })).toBe('awaiting_agent');
  });

  it('hands the ball to the user when the team replies', () => {
    expect(nextTicketStatus('awaiting_agent', { type: 'agent_replied' })).toBe('awaiting_user');
  });

  it('pulls the ticket back into the queue when the user replies', () => {
    expect(nextTicketStatus('awaiting_user', { type: 'user_replied' })).toBe('in_progress');
  });

  it('reopens a resolved ticket when the user writes again', () => {
    expect(nextTicketStatus('resolved', { type: 'user_replied' })).toBe('awaiting_agent');
  });

  it('keeps a closed ticket closed except on an explicit reopen', () => {
    expect(nextTicketStatus('closed', { type: 'user_replied' })).toBe('closed');
    expect(nextTicketStatus('closed', { type: 'agent_replied' })).toBe('closed');
    expect(nextTicketStatus('closed', { type: 'reopened' })).toBe('awaiting_agent');
  });
});

describe('queue predicates', () => {
  it('identifies tickets the team still owes an answer', () => {
    expect(isAwaitingTeam('new')).toBe(true);
    expect(isAwaitingTeam('awaiting_agent')).toBe(true);
    expect(isAwaitingTeam('in_progress')).toBe(true);
    expect(isAwaitingTeam('awaiting_user')).toBe(false);
    expect(isAwaitingTeam('resolved')).toBe(false);
  });

  it('identifies open tickets', () => {
    expect(isOpen('awaiting_user')).toBe(true);
    expect(isOpen('resolved')).toBe(false);
    expect(isOpen('closed')).toBe(false);
  });
});

describe('support timings', () => {
  const timings = {
    createdAt: '2026-08-18T10:00:00.000Z',
    firstAgentReplyAt: '2026-08-18T10:45:00.000Z',
    resolvedAt: '2026-08-18T14:00:00.000Z',
  };

  it('measures time to first response', () => {
    expect(timeToFirstResponse(timings)).toBe(2_700);
  });

  it('measures time to resolution', () => {
    expect(timeToResolution(timings)).toBe(14_400);
  });

  it('returns null while a ticket is unanswered', () => {
    expect(timeToFirstResponse({ ...timings, firstAgentReplyAt: null })).toBeNull();
    expect(timeToResolution({ ...timings, resolvedAt: null })).toBeNull();
  });

  it('excludes unanswered tickets from the average rather than zeroing them', () => {
    expect(averageSeconds([600, null, 1_200])).toBe(900);
    expect(averageSeconds([null, null])).toBeNull();
  });
});

describe('formatTicketReference', () => {
  it('formats a padded internal reference', () => {
    expect(formatTicketReference(42)).toBe('DNQ-0042');
    expect(formatTicketReference(10_420)).toBe('DNQ-10420');
  });
});
