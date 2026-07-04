-- Run this in Supabase SQL Editor
create table if not exists hall_of_fame (
  id uuid default gen_random_uuid() primary key,
  team text not null unique,
  region text default 'Global',
  title text default 'World Champion',
  titles bigint default 1,
  ovr bigint default 0
);

-- Optional: allow the API to update existing rows without duplication
create or replace function upsert_hall_of_fame_entry(p_team text, p_region text, p_title text, p_titles bigint, p_ovr bigint)
returns void
language sql
as $$
  insert into hall_of_fame(team, region, title, titles, ovr)
  values (p_team, p_region, p_title, p_titles, p_ovr)
  on conflict (team) do update
  set region = excluded.region,
      title = excluded.title,
      titles = excluded.titles,
      ovr = excluded.ovr;
$$;
