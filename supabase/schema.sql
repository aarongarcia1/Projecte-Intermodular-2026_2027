-- Altercom21: esquema inicial para Supabase.
-- Ejecuta este archivo completo en Supabase > SQL Editor.
-- Las tablas expuestas usan RLS y las claves secretas nunca deben ir al navegador.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  company text,
  phone text,
  role text not null default 'client' check (role in ('client','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (length(service_type) between 2 and 100),
  company_name text,
  description text not null check (length(description) between 10 and 5000),
  status text not null default 'received'
    check (status in ('received','reviewing','quoted','in_progress','completed','rejected')),
  budget_amount numeric(12,2) check (budget_amount is null or budget_amount >= 0),
  admin_notes text check (admin_notes is null or length(admin_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_requests_user_id_idx on public.audit_requests(user_id);
create index if not exists audit_requests_created_at_idx on public.audit_requests(created_at desc);

-- Función de comprobación de rol. SECURITY DEFINER evita la recursión de RLS al consultar profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Crear perfil automáticamente; el rol se fija en 'client' y no se lee de metadata del usuario.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, company, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'company', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists audit_requests_set_updated_at on public.audit_requests;
create trigger audit_requests_set_updated_at before update on public.audit_requests
for each row execute procedure public.set_updated_at();

-- Impedir que ni siquiera un administrador reasigne una solicitud a otro usuario o altere su fecha de creación.
create or replace function public.protect_request_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'No se puede cambiar el propietario ni la fecha de creación de una solicitud.';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_requests_protect_identity on public.audit_requests;
create trigger audit_requests_protect_identity before update on public.audit_requests
for each row execute procedure public.protect_request_identity();

alter table public.profiles enable row level security;
alter table public.audit_requests enable row level security;

-- Permisos mínimos a nivel SQL. Los clientes no pueden insertar perfiles ni editar su rol.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, company, phone) on table public.profiles to authenticated;

revoke all on table public.audit_requests from anon, authenticated;
grant select, insert on table public.audit_requests to authenticated;
grant update (status, budget_amount, admin_notes) on table public.audit_requests to authenticated;

-- Reemplazar políticas anteriores si se vuelve a ejecutar este script.
drop policy if exists "profile read self or admin" on public.profiles;
drop policy if exists "profile update self" on public.profiles;
drop policy if exists "requests read owner or admin" on public.audit_requests;
drop policy if exists "requests insert own" on public.audit_requests;
drop policy if exists "requests update admin only" on public.audit_requests;

create policy "profile read self or admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profile update self"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "requests read owner or admin"
on public.audit_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "requests insert own"
on public.audit_requests for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "requests update admin only"
on public.audit_requests for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- No se conceden DELETE a usuarios autenticados; no hay política de borrado.
