# Support

## What the driver sees

`Mais → Suporte`. A list of conversations, not a ticketing system. The
reference (`DNQ-1042`) exists for the team and appears quietly under the
subject; a driver is never asked to quote it.

Opening a ticket is three fields on one screen: a category chip, a subject, and
what happened. The conversation itself is a chat — the pattern a driver already
knows.

## Status model

Status is derived from events, never set freehand, so the inbox counters cannot
drift from reality.

| Status | Meaning | Owed by |
| --- | --- | --- |
| `new` | just opened, nobody has picked it up | team |
| `awaiting_agent` | assigned, not yet answered | team |
| `in_progress` | being worked, or the user just replied | team |
| `awaiting_user` | team answered, waiting on the driver | user |
| `resolved` | solved, still reopenable by replying | — |
| `closed` | finished; only an explicit reopen moves it | — |

Transitions are in `packages/business-logic/src/support.ts` and covered by
tests. The three "owed by team" statuses drive the unanswered counter in the
app badge, the admin sidebar and the inbox filter — one predicate, three
consumers.

## Internal notes

An internal note is a team memo attached to a ticket. It must never reach the
user, and three separate things make that true:

1. **RLS** — the `support_messages` select policy excludes
   `is_internal_note = true` for the ticket owner. A query that forgets to
   filter still cannot leak one. This is asserted in `test/rls_test.sql`.
2. **No state change** — a note does not move the ticket's status, does not
   update `last_message_at`, and does not set `first_agent_reply_at`. It is not
   activity the user can see, so it must not look like activity.
3. **Visual distinction** — in the panel a note is amber with a dashed border
   and a "🔒 NOTA INTERNA — o usuário não vê isto" header, so nobody pastes one
   into a reply by accident.

## When the team replies

`replyToTicket` runs as one Server Action:

1. insert the message
2. advance the ticket status (`agent_replied` → `awaiting_user`)
3. assign the ticket to the replying admin
4. insert a `user_notifications` row deep-linked to `/support/<id>`
5. write an audit log entry

The badge follows from the notification row; nothing separate maintains a
counter. Opening the conversation calls `mark_ticket_read()`, which marks both
the messages and the matching notifications read in one transaction.

## Realtime

The conversation subscribes to inserts on its own ticket, and the notification
counter subscribes to the user's own notification rows. Both refetch on an
event rather than patching local state from the payload — refetching is
marginally slower and considerably harder to get wrong, and reliability matters
more than instantaneity here (§75).

In the panel, the unanswered counter is computed per request in the layout,
which is a Server Component. No polling, no stale badge.

## A user cannot impersonate the team

The insert policy on `support_messages` requires `author_kind = 'user'`,
`author_id = auth.uid()`, `is_internal_note = false`, and a ticket the caller
owns that is not closed. Asserted in the database tests.

## Analytics

`timeToFirstResponse` and `timeToResolution` are computed from
`first_agent_reply_at` and `resolved_at`, which are set at write time rather
than reconstructed later from message history.

Averages exclude unanswered tickets rather than counting them as zero — an
unanswered ticket is missing data, not a fast response.

## Not built yet

- attachments (the `attachment_path` column exists; no upload UI)
- transferring a ticket to a specific agent (self-assign works; the dropdown of
  agents is not built)
- the support analytics dashboard (§92) — the timing functions exist and are
  tested, but no page renders them
- push notifications (in-app notifications work end to end)
