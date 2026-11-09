import { supabase, requireUser, getProfile, signOut } from "./supabase-client.js";
import {
  initAppShell, escapeHtml, fmtMoney, fmtDate, shortRef, statusBadge, paymentBadge,
  timelineHtml, calcTotals, showMessage, toast, REQUEST_KIND, URGENCY, PAYMENT_METHODS
} from "./ui.js";

const list = document.querySelector("#requests");
const msg = document.querySelector("#list-message");
let requests = [];
let filter = "all";

document.querySelector("#logout").addEventListener("click", signOut);

const user = await requireUser();
const profile = await getProfile(user.id);
initAppShell(profile, user);

const firstName = (profile?.full_name || "").split(" ")[0];
if (firstName) document.querySelector("#welcome").textContent = `Hola, ${firstName}`;
if (!profile?.tax_id || !profile?.billing_address) document.querySelector("#profile-warning").hidden = false;

// ---------- Clasificación ----------
const livePayment = r => (r.payments || []).find(p => ["pending", "under_review", "paid"].includes(p.status));
const isPaid = r => (r.payments || []).some(p => p.status === "paid");
const needsPayment = r => ["accepted", "in_progress", "completed"].includes(r.status)
  && r.budget_amount != null && !isPaid(r) && livePayment(r)?.status !== "under_review";
const needsAction = r => r.status === "quoted" || needsPayment(r);
const isClosed = r => ["completed", "declined", "rejected"].includes(r.status) && !needsPayment(r);
const FILTERS = {
  all: () => true,
  action: needsAction,
  open: r => !isClosed(r) && !needsAction(r),
  closed: isClosed
};

// ---------- Render ----------
function amountBlock(r) {
  if (r.budget_amount == null) return `<div class="req-amount"><small>Importe</small><b class="muted" style="font-size:1rem">Pendiente</b></div>`;
  const t = calcTotals(r.budget_amount);
  return `<div class="req-amount"><small>Total (IVA incl.)</small><b>${fmtMoney(t.total)}</b><small>${fmtMoney(t.base)} + IVA</small></div>`;
}

function detailList(r) {
  const rows = [
    ["Contacto", r.contact_name], ["Correo", r.contact_email], ["Teléfono", r.contact_phone],
    ["Sector", r.sector], ["Tamaño", r.company_size], ["Urgencia", URGENCY[r.urgency]],
    ["Presupuesto orientativo", r.budget_range], ["Fecha límite", r.deadline && fmtDate(r.deadline)],
    ["Entorno", r.audit_environment], ["Inicio preferido", r.preferred_date && fmtDate(r.preferred_date)],
    ["Ventana de pruebas", r.time_slot]
  ].filter(([, v]) => v);
  return `<dl class="dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
}

function actions(r) {
  const pay = livePayment(r);
  if (r.status === "quoted") {
    const expired = r.quote_valid_until && new Date(r.quote_valid_until) < new Date(new Date().toDateString());
    if (expired) return `<span class="small muted">Presupuesto caducado el ${fmtDate(r.quote_valid_until)}. Contacta con nosotros para renovarlo.</span>`;
    return `${r.quote_valid_until ? `<span class="small muted">Válido hasta el ${fmtDate(r.quote_valid_until)}</span>` : ""}
      <button class="btn btn-danger btn-sm" data-action="decline" data-id="${r.id}">Rechazar</button>
      <button class="btn btn-primary btn-sm" data-action="accept" data-id="${r.id}">Aceptar presupuesto</button>`;
  }
  if (needsPayment(r)) {
    return `<a class="btn btn-primary btn-sm" href="pago.html?id=${r.id}">${pay?.status === "pending" ? "Completar pago" : "Pagar ahora"}</a>`;
  }
  if (pay?.status === "under_review") return `<span class="small muted">Estamos verificando tu pago (${escapeHtml(PAYMENT_METHODS[pay.method]?.short || "")}).</span>`;
  if (pay?.status === "paid") return `<span class="small muted">Pagado el ${fmtDate(pay.paid_at)} · ${escapeHtml(pay.reference)}</span>`;
  return "";
}

function card(r) {
  const pay = livePayment(r);
  return `<article class="req">
    <div class="req-head">
      <div class="req-title">
        <span class="tag">${REQUEST_KIND[r.request_kind] || "Solicitud"} · <span class="mono">${shortRef(r.id)}</span></span>
        <h3>${escapeHtml(r.service_type)}</h3>
        <div class="req-meta">
          <span>${escapeHtml(r.company_name || "Sin empresa")}</span>
          <span>Creada el ${fmtDate(r.created_at)}</span>
          ${r.urgency && r.urgency !== "normal" ? `<span>Urgencia ${escapeHtml(URGENCY[r.urgency] || r.urgency).toLowerCase()}</span>` : ""}
        </div>
      </div>
      ${amountBlock(r)}
    </div>
    <div class="req-body">
      ${timelineHtml(r.status)}
      ${r.admin_notes ? `<div class="note"><strong>Mensaje de Altercom21:</strong> ${escapeHtml(r.admin_notes)}</div>` : ""}
      <details class="more"><summary>Ver detalle de la solicitud</summary>
        ${detailList(r)}
        ${r.audit_scope ? `<p class="req-desc"><strong>Alcance autorizado</strong>\n${escapeHtml(r.audit_scope)}</p>` : ""}
        <p class="req-desc">${escapeHtml(r.description)}</p>
      </details>
    </div>
    <div class="req-foot">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBadge(r.status)}${pay ? paymentBadge(pay.status) : ""}</div>
      <div class="actions">${actions(r)}</div>
    </div>
  </article>`;
}

function render() {
  for (const [key, fn] of Object.entries(FILTERS)) {
    document.querySelector(`[data-count="${key}"]`).textContent = requests.filter(fn).length;
  }
  const visible = requests.filter(FILTERS[filter]);
  if (!requests.length) {
    list.innerHTML = `<div class="card empty"><div class="icon-box"><svg class="i"><use href="assets/img/icons.svg#inbox"/></svg></div>
      <h3>Todavía no tienes solicitudes</h3><p>Pide un presupuesto o una auditoría y haz el seguimiento desde aquí.</p>
      <a class="btn btn-primary" href="solicitud.html">Crear mi primera solicitud</a></div>`;
    return;
  }
  list.innerHTML = visible.length ? visible.map(card).join("")
    : `<div class="card empty"><h3>No hay solicitudes en esta vista</h3><p>Prueba con otra pestaña.</p></div>`;
}

function renderKpis() {
  const paid = requests.flatMap(r => r.payments || []).filter(p => p.status === "paid");
  document.querySelector("#k-active").textContent = requests.filter(r => !isClosed(r)).length;
  document.querySelector("#k-quotes").textContent = requests.filter(r => r.status === "quoted").length;
  document.querySelector("#k-pending").textContent = requests.filter(needsPayment).length;
  document.querySelector("#k-paid").textContent = fmtMoney(paid.reduce((s, p) => s + Number(p.total), 0));
}

async function load() {
  const { data, error } = await supabase
    .from("audit_requests")
    .select("*, payments(id,reference,method,status,total,paid_at,created_at)")
    .order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = "";
    const hint = /payments|relationship|column/i.test(error.message)
      ? " Ejecuta supabase/02_presupuestos_pagos.sql en el SQL Editor de Supabase." : "";
    showMessage(msg, `No se han podido cargar las solicitudes: ${error.message}.${hint}`, "error");
    return;
  }
  requests = data || [];
  renderKpis();
  render();
}

// ---------- Eventos ----------
document.querySelectorAll(".tab[data-filter]").forEach(tab => tab.addEventListener("click", () => {
  filter = tab.dataset.filter;
  document.querySelectorAll(".tab[data-filter]").forEach(t => t.setAttribute("aria-selected", String(t === tab)));
  render();
}));

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const r = requests.find(x => x.id === btn.dataset.id);
  if (!r) return;

  if (btn.dataset.action === "accept") {
    const t = calcTotals(r.budget_amount);
    if (!confirm(`¿Aceptas el presupuesto de ${fmtMoney(t.total)} (IVA incluido) para «${r.service_type}»?\n\nA continuación podrás elegir el método de pago.`)) return;
    btn.disabled = true;
    const { error } = await supabase.rpc("respond_quote", { p_request_id: r.id, p_accept: true });
    if (error) { btn.disabled = false; return toast(error.message, "error"); }
    location.href = `pago.html?id=${r.id}`;
  }

  if (btn.dataset.action === "decline") {
    const reason = prompt("¿Quieres indicarnos el motivo? (opcional)\n\nPulsa Cancelar para no rechazar el presupuesto.", "");
    if (reason === null) return;
    btn.disabled = true;
    const { error } = await supabase.rpc("respond_quote", { p_request_id: r.id, p_accept: false, p_note: reason });
    if (error) { btn.disabled = false; return toast(error.message, "error"); }
    toast("Presupuesto rechazado. Gracias por tu respuesta.");
    await load();
  }
});

await load();
