-- Altercom21 · Escaneos sincronizados desde la app de escritorio NEXUS.
--
-- La app NEXUS usa las MISMAS cuentas que la web (Supabase Auth): una cuenta
-- creada en la app aparece en la web y al revés, y comparten perfil y
-- solicitudes. Este archivo añade la tabla donde la app guarda los escaneos
-- para que el cliente los vea en su área (dashboard.html).
--
-- Ejecútalo en Supabase > SQL Editor después de schema.sql y
-- 02_presupuestos_pagos.sql. No borra datos y se puede ejecutar varias veces.

create table if not exists public.nexus_scans (
  id uuid primary key default gen_random_uuid(),
  -- El propietario lo fija la base de datos con la sesión: el cliente no puede enviarlo.
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target text not null check (length(target) between 1 and 255),
  ip text check (ip is null or length(ip) <= 64),
  hostname text check (hostname is null or length(hostname) <= 255),
  profile text check (profile is null or length(profile) <= 60),
  ports_scanned integer not null default 0 check (ports_scanned between 0 and 65535),
  open_ports jsonb not null default '[]'::jsonb check (jsonb_typeof(open_ports) = 'array'),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  score smallint not null default 0 check (score between 0 and 100),
  rating text check (rating is null or rating in ('BAIX', 'MODERAT', 'ALT', 'CRÍTIC')),
  duration numeric(10, 2) check (duration is null or duration >= 0),
  completed boolean not null default true,
  started_at timestamptz,
  app_version text check (app_version is null or length(app_version) <= 20),
  created_at timestamptz not null default now(),
  -- Evita filas enormes (máx. 256 KB de resultados por escaneo).
  constraint nexus_scans_payload_size
    check (octet_length(open_ports::text) + octet_length(findings::text) <= 262144)
);

create index if not exists nexus_scans_user_created_idx
  on public.nexus_scans (user_id, created_at desc);

-- Límite de escaneos guardados por usuario (protección frente a abusos).
create or replace function public.nexus_scans_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.nexus_scans where user_id = new.user_id) >= 500 then
    raise exception 'Has alcanzado el máximo de 500 escaneos guardados. Elimina alguno antes de subir más.';
  end if;
  return new;
end;
$$;

revoke all on function public.nexus_scans_quota() from public;

drop trigger if exists nexus_scans_quota on public.nexus_scans;
create trigger nexus_scans_quota before insert on public.nexus_scans
for each row execute procedure public.nexus_scans_quota();

-- Seguridad: RLS + permisos mínimos por columna.
alter table public.nexus_scans enable row level security;

revoke all on table public.nexus_scans from anon, authenticated;
grant select, delete on table public.nexus_scans to authenticated;
grant insert (
  target, ip, hostname, profile, ports_scanned, open_ports, findings,
  score, rating, duration, completed, started_at, app_version
) on table public.nexus_scans to authenticated;
-- Sin UPDATE: un escaneo es un registro histórico y no se modifica.

drop policy if exists "nexus scans read owner or admin" on public.nexus_scans;
drop policy if exists "nexus scans insert own" on public.nexus_scans;
drop policy if exists "nexus scans delete own" on public.nexus_scans;

create policy "nexus scans read owner or admin"
on public.nexus_scans for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "nexus scans insert own"
on public.nexus_scans for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "nexus scans delete own"
on public.nexus_scans for delete to authenticated
using (user_id = (select auth.uid()));
