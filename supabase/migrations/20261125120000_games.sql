-- Kitchen Table (family daily games) - backend for the app in games/.
--
-- Everything lives in its own `games` schema. The schema is deliberately NOT
-- exposed through PostgREST and every table has RLS on with no policies: the
-- only thing that reads or writes it is the games-api edge function, over a
-- direct Postgres connection (SUPABASE_DB_URL). Nothing here touches the
-- fitness tables in `public`.

create schema if not exists games;
revoke all on schema games from public, anon, authenticated;

-- One row per family. `code` is what people type to join; `notes` is what the
-- puzzle writer knows about the family ({people, watching, events}).
create table if not exists games.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- One row per device that joined. The app keeps the token; we keep its hash.
create table if not exists games.players (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references games.families(id) on delete cascade,
  device_id text not null,
  token_hash text not null unique,
  name text not null,
  emoji text not null,
  color text not null,
  organizer boolean not null default false,   -- the first person to join
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (family_id, device_id)
);

-- The day's generated puzzles for a family. `updated_at` doubles as the
-- generator's heartbeat: a 'generating' row untouched for 4 minutes is stale.
create table if not exists games.daily (
  family_id uuid not null references games.families(id) on delete cascade,
  date date not null,
  status text not null check (status in ('generating', 'ready', 'failed')),
  theme text,
  puzzles jsonb,
  meta jsonb,                                  -- timings, per-game errors, token use
  attempts int not null default 1,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, date)
);

-- One finished game. The primary key is what makes "once a day" stick: the
-- first submit wins, later ones are reported back as duplicates.
create table if not exists games.results (
  player_id uuid not null references games.players(id) on delete cascade,
  family_id uuid not null references games.families(id) on delete cascade,
  date date not null,
  game text not null check (game in ('rare', 'word', 'cross', 'groups', 'blocks', 'trails', 'atlas')),
  points int not null check (points between 0 and 100),
  detail jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, date, game)
);
create index if not exists results_family_date on games.results (family_id, date);

-- Server-side settings. Holds the secret the cron job presents to the function.
create table if not exists games.config (
  key text primary key,
  value text not null
);

alter table games.families enable row level security;
alter table games.players enable row level security;
alter table games.daily enable row level security;
alter table games.results enable row level security;
alter table games.config enable row level security;

-- Generated here so it never appears in the repo.
insert into games.config (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Pre-generate each family's puzzles at 09:00 UTC (1-2am Pacific, 4-5am
-- Eastern) for that UTC date, so they are waiting at breakfast. If this ever
-- misses, the app's first `daily` request of the day generates on demand.
-- The function only honours action "cron" with the secret above, so nobody
-- outside the database can trigger paid generation.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'games-daily-pregenerate',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://qenbkrxjsxbsetfeffza.supabase.co/functions/v1/games-api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from games.config where key = 'cron_secret')
    ),
    body := '{"action": "cron"}'::jsonb,
    timeout_milliseconds := 15000
  )
  $$
);
