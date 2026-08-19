-- Dismissing a notification.
--
-- Reading and dismissing are different acts: a driver who has read a message
-- still wants it off the list. Until now the only thing a user could do to a
-- notification was set read_at, so the bell's sheet had nothing to offer
-- beyond "marcar como lida" and the list only ever grew.
--
-- Dismissal is a timestamp rather than a delete. The message stays available
-- to support and to analytics, which is where "did the reminder land?" gets
-- answered, and the driver still sees an empty list.

alter table user_notifications
  add column if not exists dismissed_at timestamptz;

-- The bell counts unread AND undismissed, so the partial index has to match.
drop index if exists user_notifications_unread_idx;
create index user_notifications_unread_idx
  on user_notifications (user_id, created_at desc)
  where read_at is null and dismissed_at is null;

create index if not exists user_notifications_live_idx
  on user_notifications (user_id, created_at desc)
  where dismissed_at is null;

-- Same reasoning as read_at: the user may set this column and no other, so a
-- grant on the whole table stays out of the question.
grant update (dismissed_at) on user_notifications to authenticated;

-- A dismissed message must not keep the bell lit.
create or replace view notification_counts
with (security_invoker = true) as
select
  user_id,
  count(*)::integer as unread_total,
  count(*) filter (where category = 'support')::integer as unread_support
from user_notifications
where read_at is null and dismissed_at is null
group by user_id;
