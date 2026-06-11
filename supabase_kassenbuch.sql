-- Kassenbuch: Einträge pro Admin
create table kassenbuch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('in','out')),
  amount      numeric(10,2) not null check (amount > 0),
  description text not null,
  date        date not null,
  created_at  timestamptz default now()
);

-- Startbetrag pro Admin
create table kassenbuch_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  startbetrag numeric(10,2) not null default 0,
  updated_at  timestamptz default now()
);

-- RLS aktivieren
alter table kassenbuch          enable row level security;
alter table kassenbuch_settings enable row level security;

-- Jeder Nutzer sieht und bearbeitet nur seine eigenen Daten
create policy "own kassenbuch entries"
  on kassenbuch for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own kassenbuch settings"
  on kassenbuch_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index für schnelle Abfragen nach User + Datum
create index kassenbuch_user_date on kassenbuch(user_id, date desc);
