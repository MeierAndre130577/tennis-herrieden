-- ═══════════════════════════════════════════════════════════════════════════
-- Tennis Herrieden – Schema für neues Supabase-Projekt
-- Im SQL-Editor des NEUEN Supabase-Projekts ausführen
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PROFILES ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  role        text not null default 'pending' check (role in ('pending','known','member','member2','admin')),
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Eigenes Profil lesen"   on public.profiles for select using (auth.uid() = id);
create policy "Eigenes Profil ändern"  on public.profiles for update using (auth.uid() = id);
create policy "Admin liest alle"       on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admin ändert alle"      on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Neues Profil bei Registrierung automatisch anlegen
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email, 'pending');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── COURTS ──────────────────────────────────────────────────────────────────
create table if not exists public.courts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  surface     text,
  sort_order  int default 0,
  created_at  timestamptz default now()
);
alter table public.courts enable row level security;
create policy "Alle lesen"    on public.courts for select using (true);
create policy "Admin schreibt" on public.courts for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── BOOKINGS ────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid references public.courts(id) on delete cascade,
  user_id     uuid,
  user_name   text,
  date        date not null,
  slot        text not null,
  type        text default 'regular',
  label       text,
  with_guest  boolean default false,
  guest_fee   numeric(10,2) default 0,
  guest_paid  boolean default false,
  created_at  timestamptz default now(),
  unique(court_id, date, slot)
);
alter table public.bookings enable row level security;
create policy "Eingeloggte lesen"   on public.bookings for select using (auth.role() = 'authenticated');
create policy "Eigene anlegen"      on public.bookings for insert with check (auth.uid() = user_id);
create policy "Eigene löschen"      on public.bookings for delete using (auth.uid() = user_id);
create policy "Admin alles"         on public.bookings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── SETTINGS ────────────────────────────────────────────────────────────────
create table if not exists public.settings (
  key   text primary key,
  value text
);
alter table public.settings enable row level security;
create policy "Eingeloggte lesen"  on public.settings for select using (auth.role() = 'authenticated');
create policy "Anon liest Display" on public.settings for select using (true);
create policy "Admin schreibt"     on public.settings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Anon upsert btv_match_cache" on public.settings for insert with check (true);
create policy "Anon update settings"        on public.settings for update using (true);

-- ── KASSE LOG ───────────────────────────────────────────────────────────────
create table if not exists public.kasse_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  drink_name  text,
  price       numeric(10,2),
  emoji       text,
  qty         integer default 1,
  date        date default current_date,
  paid        boolean default false,
  created_at  timestamptz default now()
);
alter table public.kasse_log enable row level security;
create policy "Eingeloggte lesen"  on public.kasse_log for select using (auth.role() = 'authenticated');
create policy "Eigene anlegen"     on public.kasse_log for insert with check (auth.uid() = user_id);
create policy "Admin alles"        on public.kasse_log for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── KASSE FAVORITES ─────────────────────────────────────────────────────────
create table if not exists public.kasse_favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  name        text,
  price       numeric(10,2),
  emoji       text,
  sort_order  int default 0,
  created_at  timestamptz default now()
);
alter table public.kasse_favorites enable row level security;
create policy "Eigene lesen"    on public.kasse_favorites for select using (auth.uid() = user_id);
create policy "Eigene schreiben" on public.kasse_favorites for all using (auth.uid() = user_id);

-- ── KASSENBUCH ──────────────────────────────────────────────────────────────
create table if not exists public.kassenbuch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  type        text not null,
  amount      numeric(10,2) not null,
  description text,
  date        date not null,
  created_at  timestamptz default now()
);
alter table public.kassenbuch enable row level security;
create policy "Eigene lesen"     on public.kassenbuch for select using (auth.uid() = user_id);
create policy "Eigene schreiben" on public.kassenbuch for all using (auth.uid() = user_id);
create policy "Admin alles"      on public.kassenbuch for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── KASSENBUCH SETTINGS ─────────────────────────────────────────────────────
create table if not exists public.kassenbuch_settings (
  user_id     uuid primary key,
  startbetrag numeric(10,2) default 0,
  updated_at  timestamptz default now()
);
alter table public.kassenbuch_settings enable row level security;
create policy "Eigene lesen"     on public.kassenbuch_settings for select using (auth.uid() = user_id);
create policy "Eigene schreiben" on public.kassenbuch_settings for all using (auth.uid() = user_id);

-- ── NEWS ITEMS (Clubstream) ──────────────────────────────────────────────────
create table if not exists public.news_items (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  type            text,
  summary         text,
  content         text,
  image_url       text,
  status          text default 'published',
  is_pinned       boolean default false,
  priority        int default 0,
  published_at    timestamptz default now(),
  event_start     timestamptz,
  event_end       timestamptz,
  event_location  text,
  result_home     text,
  result_away     text,
  team_name       text,
  opponent        text,
  league          text,
  age_group       text,
  valid_from      date,
  valid_until     date,
  deleted_at      timestamptz,
  created_at      timestamptz default now()
);
alter table public.news_items enable row level security;
create policy "Alle lesen published"   on public.news_items for select using (status = 'published' and deleted_at is null);
create policy "Eingeloggte lesen alle" on public.news_items for select using (auth.role() = 'authenticated');
create policy "Admin schreibt"         on public.news_items for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── CATEGORIES (Clubstream) ──────────────────────────────────────────────────
create table if not exists public.categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  slug  text unique,
  color text
);
alter table public.categories enable row level security;
create policy "Alle lesen"    on public.categories for select using (true);
create policy "Admin schreibt" on public.categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── NEWS CATEGORY ASSIGNMENTS ────────────────────────────────────────────────
create table if not exists public.news_category_assignments (
  news_item_id  uuid references public.news_items(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete cascade,
  primary key (news_item_id, category_id)
);
alter table public.news_category_assignments enable row level security;
create policy "Alle lesen"    on public.news_category_assignments for select using (true);
create policy "Admin schreibt" on public.news_category_assignments for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ── CLUB PHOTOS (Clubstream Vereinsfotos) ────────────────────────────────────
create table if not exists public.club_photos (
  id          uuid primary key default gen_random_uuid(),
  url         text,
  caption     text,
  user_id     uuid,
  created_at  timestamptz default now()
);
alter table public.club_photos enable row level security;
create policy "Alle lesen"     on public.club_photos for select using (true);
create policy "Eingeloggte schreiben" on public.club_photos for insert with check (auth.role() = 'authenticated');
create policy "Admin alles"    on public.club_photos for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
