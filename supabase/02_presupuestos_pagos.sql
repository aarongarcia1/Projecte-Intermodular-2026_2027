-- Altercom21 · Migración 02: presupuestos/auditorías profesionales y métodos de pago.
-- Ejecuta este archivo DESPUÉS de schema.sql en Supabase > SQL Editor.
-- Es idempotente: se puede volver a ejecutar sin perder datos.

-- =====================================================================
-- 1. Datos de facturación en el perfil
-- =====================================================================
alter table public.profiles
  add column if not exists tax_id text check (tax_id is null or length(tax_id) <= 20),
  add column if not exists billing_address text check (billing_address is null or length(billing_address) <= 250),
  add column if not exists postal_code text check (postal_code is null or length(postal_code) <= 12),
  add column if not exists city text check (city is null or length(city) <= 100),
  add column if not exists country text default 'España' check (country is null or length(country) <= 60);

grant update (full_name, company, phone, tax_id, billing_address, postal_code, city, country)
  on table public.profiles to authenticated;

-- =====================================================================
-- 2. Solicitudes más completas (presupuesto / auditoría)
-- =====================================================================
alter table public.audit_requests
  add column if not exists request_kind text not null default 'budget' check (request_kind in ('budget','audit')),
  add column if not exists contact_name text check (contact_name is null or length(contact_name) <= 120),
  add column if not exists contact_email text check (contact_email is null or length(contact_email) <= 160),
  add column if not exists contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  add column if not exists sector text check (sector is null or length(sector) <= 80),
  add column if not exists company_size text check (company_size is null or length(company_size) <= 40),
  add column if not exists urgency text not null default 'normal' check (urgency in ('low','normal','high','critical')),
  add column if not exists budget_range text check (budget_range is null or length(budget_range) <= 40),
  add column if not exists deadline date,
  add column if not exists audit_scope text check (audit_scope is null or length(audit_scope) <= 2000),
  add column if not exists audit_environment text check (audit_environment is null or length(audit_environment) <= 40),
  add column if not exists preferred_date date,
  add column if not exists time_slot text check (time_slot is null or length(time_slot) <= 40),
  add column if not exists authorization_confirmed boolean not null default false,
  add column if not exists quote_valid_until date,
  add column if not exists quote_responded_at timestamptz,
  add column if not exists client_response_note text check (client_response_note is null or length(client_response_note) <= 1000);

-- Nuevos estados: el cliente puede aceptar ('accepted') o rechazar ('declined') el presupuesto.
alter table public.audit_requests drop constraint if exists audit_requests_status_check;
alter table public.audit_requests add constraint audit_requests_status_check
  check (status in ('received','reviewing','quoted','accepted','declined','in_progress','completed','rejected'));

-- Una auditoría exige la declaración de autorización del cliente.
alter table public.audit_requests drop constraint if exists audit_requests_audit_authorized;
alter table public.audit_requests add constraint audit_requests_audit_authorized
  check (request_kind <> 'audit' or authorization_confirmed) not valid;

-- Seguridad: el cliente solo puede insertar los campos de su solicitud,
-- nunca el estado, el importe ni las notas internas.
revoke insert on table public.audit_requests from authenticated;
grant insert (
  user_id, service_type, company_name, description, request_kind,
  contact_name, contact_email, contact_phone, sector, company_size, urgency,
  budget_range, deadline, audit_scope, audit_environment, preferred_date,
  time_slot, authorization_confirmed
) on table public.audit_requests to authenticated;

grant update (status, budget_amount, admin_notes, quote_valid_until)
  on table public.audit_requests to authenticated; -- la política RLS limita el UPDATE a administradores

-- No se puede marcar como "presupuesto enviado" sin importe.
create or replace function public.validate_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'quoted' and new.budget_amount is null then
    raise exception 'Indica el importe antes de enviar el presupuesto.';
  end if;
  if new.status = 'quoted' and old.status is distinct from 'quoted' and new.quote_valid_until is null then
    new.quote_valid_until := current_date + 30;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_requests_validate_quote on public.audit_requests;
create trigger audit_requests_validate_quote before update on public.audit_requests
for each row execute procedure public.validate_quote();

-- =====================================================================
-- 3. Pagos
-- =====================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.audit_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  method text not null check (method in ('transfer','bizum','card')),
  status text not null default 'pending'
    check (status in ('pending','under_review','paid','failed','refunded','cancelled')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  vat_rate numeric(5,2) not null default 21,
  vat_amount numeric(12,2) not null check (vat_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  currency text not null default 'EUR',
  billing_name text not null check (length(billing_name) between 2 and 160),
  billing_tax_id text not null check (length(billing_tax_id) between 5 and 20),
  billing_address text not null check (length(billing_address) between 5 and 400),
  admin_notes text check (admin_notes is null or length(admin_notes) <= 1000),
  client_marked_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_request_id_idx on public.payments(request_id);
-- Solo un pago "vivo" por solicitud.
create unique index if not exists payments_one_open_per_request
  on public.payments(request_id) where status in ('pending','under_review','paid');

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
for each row execute procedure public.set_updated_at();

-- Al confirmar el cobro: fecha de pago y la solicitud pasa a "En curso".
create or replace function public.on_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    update public.audit_requests set status = 'in_progress'
      where id = new.request_id and status = 'accepted';
  end if;
  if new.status <> 'paid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_status_change on public.payments;
create trigger payments_status_change before update on public.payments
for each row execute procedure public.on_payment_status_change();

alter table public.payments enable row level security;

revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;
grant update (status, admin_notes) on table public.payments to authenticated; -- RLS: solo admin
-- Sin INSERT directo: los pagos se crean con la función create_payment().

drop policy if exists "payments read owner or admin" on public.payments;
drop policy if exists "payments update admin only" on public.payments;

create policy "payments read owner or admin"
on public.payments for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "payments update admin only"
on public.payments for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- =====================================================================
-- 4. Funciones que usa el cliente (validan siempre que sea el propietario)
-- =====================================================================

-- Aceptar o rechazar un presupuesto enviado.
create or replace function public.respond_quote(p_request_id uuid, p_accept boolean, p_note text default null)
returns public.audit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.audit_requests;
begin
  select * into r from public.audit_requests
    where id = p_request_id and user_id = (select auth.uid())
    for update;
  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;
  if r.status <> 'quoted' then
    raise exception 'Este presupuesto no está pendiente de respuesta.';
  end if;
  if p_accept and r.quote_valid_until is not null and r.quote_valid_until < current_date then
    raise exception 'El presupuesto ha caducado. Solicita uno actualizado.';
  end if;

  update public.audit_requests
    set status = case when p_accept then 'accepted' else 'declined' end,
        quote_responded_at = now(),
        client_response_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
    where id = p_request_id
    returning * into r;
  return r;
end;
$$;

-- Crear (o actualizar si sigue pendiente) el pago de un presupuesto aceptado.
-- El importe se calcula SIEMPRE en el servidor a partir del presupuesto.
create or replace function public.create_payment(
  p_request_id uuid,
  p_method text,
  p_billing_name text,
  p_billing_tax_id text,
  p_billing_address text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.audit_requests;
  p public.payments;
  v_vat_rate numeric := 21;
  v_vat numeric;
begin
  if p_method not in ('transfer','bizum','card') then
    raise exception 'Método de pago no válido.';
  end if;
  if length(trim(coalesce(p_billing_name, ''))) < 2
     or length(trim(coalesce(p_billing_tax_id, ''))) < 5
     or length(trim(coalesce(p_billing_address, ''))) < 5 then
    raise exception 'Completa los datos de facturación.';
  end if;

  select * into r from public.audit_requests
    where id = p_request_id and user_id = (select auth.uid())
    for update;
  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;
  if r.status not in ('accepted','in_progress','completed') then
    raise exception 'Primero debes aceptar el presupuesto.';
  end if;
  if r.budget_amount is null then
    raise exception 'La solicitud todavía no tiene importe.';
  end if;
  if exists (select 1 from public.payments where request_id = r.id and status = 'paid') then
    raise exception 'Esta solicitud ya está pagada.';
  end if;
  if exists (select 1 from public.payments where request_id = r.id and status = 'under_review') then
    raise exception 'Ya hay un pago pendiente de verificación para esta solicitud.';
  end if;

  v_vat := round(r.budget_amount * v_vat_rate / 100, 2);

  select * into p from public.payments
    where request_id = r.id and status = 'pending'
    for update;

  if found then
    update public.payments
      set method = p_method,
          subtotal = r.budget_amount,
          vat_rate = v_vat_rate,
          vat_amount = v_vat,
          total = r.budget_amount + v_vat,
          billing_name = trim(p_billing_name),
          billing_tax_id = upper(trim(p_billing_tax_id)),
          billing_address = trim(p_billing_address)
      where id = p.id
      returning * into p;
    return p;
  end if;

  insert into public.payments (
    request_id, user_id, reference, method, subtotal, vat_rate, vat_amount, total,
    billing_name, billing_tax_id, billing_address
  ) values (
    r.id, r.user_id,
    'ALT-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    p_method, r.budget_amount, v_vat_rate, v_vat, r.budget_amount + v_vat,
    trim(p_billing_name), upper(trim(p_billing_tax_id)), trim(p_billing_address)
  )
  returning * into p;
  return p;
end;
$$;

-- El cliente indica que ya ha realizado el pago (transferencia/Bizum/tarjeta).
create or replace function public.mark_payment_sent(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payments;
begin
  update public.payments
    set status = 'under_review', client_marked_at = now()
    where id = p_payment_id and user_id = (select auth.uid()) and status = 'pending'
    returning * into p;
  if not found then
    raise exception 'No se ha encontrado un pago pendiente con ese identificador.';
  end if;
  return p;
end;
$$;

revoke all on function public.respond_quote(uuid, boolean, text) from public;
revoke all on function public.create_payment(uuid, text, text, text, text) from public;
revoke all on function public.mark_payment_sent(uuid) from public;
-- Supabase concede EXECUTE a "anon" por defecto en funciones nuevas: se retira explícitamente.
revoke execute on function public.respond_quote(uuid, boolean, text) from anon;
revoke execute on function public.create_payment(uuid, text, text, text, text) from anon;
revoke execute on function public.mark_payment_sent(uuid) from anon;
grant execute on function public.respond_quote(uuid, boolean, text) to authenticated;
grant execute on function public.create_payment(uuid, text, text, text, text) to authenticated;
grant execute on function public.mark_payment_sent(uuid) to authenticated;

-- Recargar el esquema de la API para que PostgREST vea las columnas nuevas.
notify pgrst, 'reload schema';
