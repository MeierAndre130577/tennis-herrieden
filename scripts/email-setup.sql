-- ═══════════════════════════════════════════════════════════════════════════
-- E-Mail-Benachrichtigungen – einmalig im Supabase SQL-Editor ausführen
--
-- Vorher die zwei Platzhalter ersetzen (NICHT mit echtem Secret committen):
--   <DOMAIN>  → Produktions-Domain der App, z. B. tennis-herrieden.de
--   <SECRET>  → gleicher Wert wie die Vercel-Variable NEW_MEMBER_WEBHOOK_SECRET
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Opt-in-Spalte: jedes Mitglied entscheidet selbst (Standard: aus)
alter table public.profiles
  add column if not exists email_notifications boolean not null default false;

-- 2) Eigenen Haken setzen (gleiches Muster wie update_own_anonymous_bookings)
create or replace function public.update_own_email_notifications(p_value boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set email_notifications = p_value where id = auth.uid();
$$;
grant execute on function public.update_own_email_notifications(boolean) to authenticated;

-- 3) Empfängerliste für Mitglieder-Mails – nur für Admins abrufbar
create or replace function public.get_mail_recipients()
returns table (name text, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Nur für Admins';
  end if;
  return query
    select p.name, p.email
    from public.profiles p
    where p.email_notifications
      and p.role in ('member', 'member2', 'admin')
      and p.email is not null;
end;
$$;
revoke all on function public.get_mail_recipients() from public, anon;
grant execute on function public.get_mail_recipients() to authenticated;

-- 4) Neue Registrierung → Info-Mail an den Verein (läuft asynchron über pg_net,
--    ein Fehler beim Mailversand verhindert die Registrierung nicht)
create extension if not exists pg_net with schema extensions;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email, 'pending');

  perform net.http_post(
    url     := 'https://<DOMAIN>/api/notify-new-member',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<SECRET>'),
    body    := jsonb_build_object(
      'name',  coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
      'email', new.email
    )
  );

  return new;
end;
$$;
