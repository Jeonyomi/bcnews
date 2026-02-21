-- Disable legacy sources (old list) by id range.
-- Assumption: legacy sources are id <= 53 (confirmed old API returned 53 rows).

update public.sources
set enabled = false
where id <= 53;
