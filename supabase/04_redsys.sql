-- Altercom21 · Migració 04: passarel·la de pagament Redsys (TPV virtual).
-- Executa aquest fitxer DESPRÉS de 02_presupuestos_pagos.sql a Supabase > SQL Editor.
-- És idempotent: es pot tornar a executar sense perdre dades.
--
-- El pagament amb Redsys el confirma automàticament la Edge Function "redsys"
-- (supabase/functions/redsys/index.ts) quan Redsys li envia la notificació signada.

-- 1. Nou mètode de pagament 'redsys'
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('transfer','bizum','card','redsys'));

-- 2. Dades de l'operació a Redsys (només les escriu la Edge Function amb la service role)
alter table public.payments
  add column if not exists redsys_order text unique check (redsys_order is null or redsys_order ~ '^[0-9]{4}[0-9A-Za-z]{0,8}$'),
  add column if not exists redsys_response text check (redsys_response is null or length(redsys_response) <= 10),
  add column if not exists redsys_auth_code text check (redsys_auth_code is null or length(redsys_auth_code) <= 20),
  add column if not exists redsys_notified_at timestamptz;

-- create_payment(): igual que a 02, però accepta també el mètode 'redsys'.
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
  if p_method not in ('transfer','bizum','card','redsys') then
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

revoke all on function public.create_payment(uuid, text, text, text, text) from public;
revoke execute on function public.create_payment(uuid, text, text, text, text) from anon;
grant execute on function public.create_payment(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
