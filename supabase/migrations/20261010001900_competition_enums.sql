-- Competition Engine V2 — enum values (own migration: a new enum value cannot
-- be used in the same transaction that adds it).
--
--   match_status: knockout football after a level 90 minutes.
--     ET1       extra time, first half (period 3)
--     ET_BREAK  break before ET1 (current_period 2) or between ET1 and ET2
--               (current_period 3)
--     ET2       extra time, second half (period 4)
--     PENS      penalty shoot-out (period 5; the clock does not run)
--   competition_format: GROUPS (group stage only). GROUPS_KNOCKOUT is the
--     existing "groups to knockout" value and is kept as is.

alter type public.match_status add value if not exists 'ET1' after '2H';
alter type public.match_status add value if not exists 'ET_BREAK' after 'ET1';
alter type public.match_status add value if not exists 'ET2' after 'ET_BREAK';
alter type public.match_status add value if not exists 'PENS' after 'ET2';

alter type public.competition_format add value if not exists 'GROUPS' after 'KNOCKOUT';
