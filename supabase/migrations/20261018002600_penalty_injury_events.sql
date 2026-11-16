-- Match events: penalty awarded, penalty saved and injury.
--
-- * PENALTY_AWARDED: the referee gives a penalty (team only). Never scores:
--   only PENALTY_GOAL (unchanged) adds a goal; PENALTY_MISS stays for a miss.
-- * PENALTY_SAVED: the keeper saves it (taking team, optional taker). Never scores.
-- * INJURY: play stopped for an injury (team, optional player). No medical
--   details are stored; it never scores and is not a card or substitution.
-- Scoring is driven by event_types.scores_for, which is null for all three;
-- undo/void, sequencing and the audit trail are the existing event machinery.
-- None of these types trigger push notifications (notify_on_event ignores them).
-- Regulation/extra-time events only: penalty shoot-outs are not recorded as events.

insert into public.event_types (code, sport_id, name, scores_for, requires_player, requires_related_player)
select v.code, s.id, v.name, null, false, false
from (values
  ('PENALTY_AWARDED', 'Penalty awarded'),
  ('PENALTY_SAVED', 'Penalty saved'),
  ('INJURY', 'Injury')
) v(code, name)
cross join (select sport_id as id from public.event_types where code = 'PENALTY_GOAL') s
on conflict (code) do nothing;
