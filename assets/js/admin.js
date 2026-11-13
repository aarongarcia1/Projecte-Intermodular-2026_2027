import { supabase, requireUser, getProfile, signOut } from "./supabase-client.js";
import {
  initAppShell, escapeHtml, fmtMoney, fmtDate, fmtDateTime, shortRef, statusBadge, paymentBadge,
  calcTotals, showMessage, toast, REQUEST_STATUS, REQUEST_KIND, URGENCY, PAYMENT_METHODS
} from "./ui.js";

const $ = s => document.querySelector(s);
const msg = $("#admin-message");
const requestsEl = $("#admin-requests");
const paymentsEl = $("#admin-payments");
const usersEl = $("#admin-users");

$("#logout").addEventListener("click", signOut);

const user = await requireUser();
const me = await getProfile(user.id);
initAppShell(me, user);

if (me?.role !== "admin") {
  showMessage(msg, "No tens permisos per accedir al tauler d'administració.", "error");
  throw new Error("Accés d'administrador denegat");
}
$("#admin-app").hidden = false;

let requests = [];
let payments = [];
let profiles = new Map();

// Estados en el filtro.
$("#f-status").insertAdjacentHTML("beforeend",
  Object.entries(REQUEST_STATUS).map(([v, s]) => `<option value="${v}">${s.label}</option>`).join(""));

// ---------- Carga ----------
async function load() {
  const [r, p, u] = await Promise.all([
    supabase.from("audit_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false })
  ]);
  const err = r.error || p.error || u.error;
  if (err) {
    const hint = /payments|column|schema cache/i.test(err.message) ? " Executa supabase/02_presupuestos_pagos.sql a Supabase." : "";
    showMessage(msg, `Error en carregar les dades: ${err.message}.${hint}`, "error");
    return;
  }
  showMessage(msg, "", "");
  requests = r.data;
  payments = p.data;
  profiles = new Map(u.data.map(x => [x.id, x]));
  renderKpis();
  renderRequests();
  renderPayments();
  renderUsers();
}

const clientName = id => profiles.get(id)?.full_name || "Client";
const paymentFor = id => payments.find(p => p.request_id === id && ["pending", "under_review", "paid"].includes(p.status));

function renderKpis() {
  $("#k-new").textContent = requests.filter(r => ["received", "reviewing"].includes(r.status)).length;
  $("#k-quoted").textContent = requests.filter(r => r.status === "quoted").length;
  $("#k-verify").textContent = payments.filter(p => p.status === "under_review").length;
  $("#k-revenue").textContent = fmtMoney(payments.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.total), 0));
  $("#c-requests").textContent = requests.length;
  $("#c-payments").textContent = payments.length;
  $("#c-clients").textContent = profiles.size;
}

// ---------- Solicitudes ----------
function detail(r) {
  const rows = [
    ["Contacte", r.contact_name], ["Correu", r.contact_email], ["Telèfon", r.contact_phone],
    ["Sector", r.sector], ["Mida", r.company_size], ["Pressupost orientatiu", r.budget_range],
    ["Data límit", r.deadline && fmtDate(r.deadline)], ["Entorn", r.audit_environment],
    ["Inici preferit", r.preferred_date && fmtDate(r.preferred_date)], ["Finestra", r.time_slot],
    ["Autorització", r.request_kind === "audit" ? (r.authorization_confirmed ? "Declarada pel client" : "NO declarada") : null],
    ["Resposta del client", r.quote_responded_at && `${fmtDateTime(r.quote_responded_at)}${r.client_response_note ? " · " + r.client_response_note : ""}`]
  ].filter(([, v]) => v);
  return `<dl class="dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
}

function requestCard(r) {
  const pay = paymentFor(r.id);
  const t = calcTotals(r.budget_amount);
  const locked = ["accepted", "in_progress", "completed"].includes(r.status) && pay;
  return `<article class="req">
    <div class="req-head">
      <div class="req-title">
        <span class="tag">${REQUEST_KIND[r.request_kind] || "Sol·licitud"} · <span class="mono">${shortRef(r.id)}</span></span>
        <h3>${escapeHtml(r.service_type)}</h3>
        <div class="req-meta">
          <span><strong>${escapeHtml(clientName(r.user_id))}</strong></span>
          <span>${escapeHtml(r.company_name || profiles.get(r.user_id)?.company || "Sense empresa")}</span>
          <span>${fmtDateTime(r.created_at)}</span>
          <span>Urgència: ${escapeHtml(URGENCY[r.urgency] || "Normal")}</span>
        </div>
      </div>
      <div class="req-amount"><small>Total amb IVA</small><b>${r.budget_amount == null ? "—" : fmtMoney(t.total)}</b></div>
    </div>
    <div class="req-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${statusBadge(r.status)}${pay ? paymentBadge(pay.status) : ""}</div>
      <details class="more"><summary>Veure la sol·licitud completa</summary>
        ${detail(r)}
        ${r.audit_scope ? `<p class="req-desc"><strong>Abast autoritzat</strong>\n${escapeHtml(r.audit_scope)}</p>` : ""}
        <p class="req-desc">${escapeHtml(r.description)}</p>
      </details>
    </div>
    <form class="admin-edit" data-id="${r.id}">
      <label class="field"><span>Estat</span>
        <select name="status">${Object.entries(REQUEST_STATUS).map(([v, s]) =>
          `<option value="${v}"${v === r.status ? " selected" : ""}>${s.label}</option>`).join("")}</select>
      </label>
      <label class="field"><span>Import base (sense IVA)</span>
        <input name="budget_amount" type="number" min="0" step="0.01" value="${r.budget_amount ?? ""}" placeholder="0,00 €"${locked ? " readonly title=\"Ja hi ha un pagament associat\"" : ""}>
        <span class="hint" data-total>${r.budget_amount == null ? "Total amb IVA: —" : `Total amb IVA: ${fmtMoney(t.total)}`}</span>
      </label>
      <label class="field"><span>Validesa del pressupost</span>
        <input name="quote_valid_until" type="date" value="${r.quote_valid_until ?? ""}">
        <span class="hint">Per defecte, 30 dies des de l'enviament.</span>
      </label>
      <label class="field full"><span>Missatge per al client</span>
        <textarea name="admin_notes" rows="2" maxlength="3000" placeholder="Abast, lliurables, terminis o propers passos…">${escapeHtml(r.admin_notes || "")}</textarea>
      </label>
      <div class="row-actions">
        ${r.status !== "quoted" && !pay ? `<button class="btn btn-secondary btn-sm" type="submit" data-send-quote>Envia el pressupost</button>` : ""}
        <button class="btn btn-primary btn-sm" type="submit">Desa els canvis</button>
      </div>
    </form>
  </article>`;
}

function renderRequests() {
  const q = $("#q").value.trim().toLowerCase();
  const fs = $("#f-status").value;
  const fk = $("#f-kind").value;
  const visible = requests.filter(r => {
    if (fs && r.status !== fs) return false;
    if (fk && r.request_kind !== fk) return false;
    if (!q) return true;
    const p = profiles.get(r.user_id);
    return [r.service_type, r.company_name, r.contact_name, r.contact_email, p?.full_name, p?.company, shortRef(r.id), r.description]
      .some(v => String(v || "").toLowerCase().includes(q));
  });
  requestsEl.innerHTML = visible.length ? visible.map(requestCard).join("")
    : `<div class="card empty"><h3>Sense resultats</h3><p>No hi ha sol·licituds que coincideixin amb els filtres.</p></div>`;
}

requestsEl.addEventListener("input", e => {
  if (e.target.name !== "budget_amount") return;
  const hint = e.target.closest(".field").querySelector("[data-total]");
  const v = e.target.value;
  hint.textContent = v === "" ? "Total amb IVA: —" : `Total amb IVA: ${fmtMoney(calcTotals(v).total)}`;
});

requestsEl.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const raw = String(fd.get("budget_amount") ?? "").trim();
  const update = {
    status: e.submitter?.hasAttribute("data-send-quote") ? "quoted" : fd.get("status"),
    budget_amount: raw === "" ? null : Number(raw),
    quote_valid_until: fd.get("quote_valid_until") || null,
    admin_notes: String(fd.get("admin_notes") ?? "").trim() || null
  };
  if (update.budget_amount !== null && (!Number.isFinite(update.budget_amount) || update.budget_amount < 0)) {
    return toast("Introdueix un import vàlid.", "error");
  }
  if (update.status === "quoted" && update.budget_amount === null) {
    return toast("Indica l'import abans d'enviar el pressupost.", "error");
  }
  form.querySelectorAll("button").forEach(b => (b.disabled = true));
  const { error } = await supabase.from("audit_requests").update(update).eq("id", form.dataset.id);
  form.querySelectorAll("button").forEach(b => (b.disabled = false));
  if (error) return toast(error.message, "error");
  toast(update.status === "quoted" ? "Pressupost enviat al client" : "Sol·licitud actualitzada");
  await load();
});

["#q", "#f-status", "#f-kind"].forEach(s => $(s).addEventListener("input", renderRequests));

// ---------- Pagos ----------
function renderPayments() {
  if (!payments.length) {
    paymentsEl.innerHTML = `<div class="empty"><h3>Encara no hi ha pagaments</h3><p>Apareixeran aquí quan un client accepti un pressupost i triï el mètode de pagament.</p></div>`;
    return;
  }
  const reqById = new Map(requests.map(r => [r.id, r]));
  paymentsEl.innerHTML = `<table class="table">
    <thead><tr><th>Referència</th><th>Client</th><th>Mètode</th><th class="num">Import</th><th>Estat</th><th>Data</th><th></th></tr></thead>
    <tbody>${payments.map(p => {
      const r = reqById.get(p.request_id);
      const actions = p.status === "pending" || p.status === "under_review"
        ? `<button class="btn btn-primary btn-sm" data-pay="${p.id}" data-status="paid">Confirma el cobrament</button>
           <button class="btn btn-danger btn-sm" data-pay="${p.id}" data-status="failed">Fallit</button>`
        : p.status === "paid" ? `<button class="btn btn-secondary btn-sm" data-pay="${p.id}" data-status="refunded">Reemborsa</button>` : "";
      return `<tr>
        <td><div class="cell-title mono">${escapeHtml(p.reference)}</div><div class="cell-sub">${escapeHtml(r?.service_type || "")}</div></td>
        <td><div class="cell-title">${escapeHtml(p.billing_name)}</div><div class="cell-sub">${escapeHtml(p.billing_tax_id)} · ${escapeHtml(clientName(p.user_id))}</div></td>
        <td>${escapeHtml(PAYMENT_METHODS[p.method]?.short || p.method)}</td>
        <td class="num"><div class="cell-title">${fmtMoney(p.total)}</div><div class="cell-sub">${fmtMoney(p.subtotal)} + IVA</div></td>
        <td>${paymentBadge(p.status)}</td>
        <td><div>${fmtDate(p.created_at)}</div><div class="cell-sub">${p.paid_at ? "Cobrat el " + fmtDate(p.paid_at) : p.client_marked_at ? "Avisat el " + fmtDate(p.client_marked_at) : ""}</div></td>
        <td class="num"><div style="display:flex;gap:6px;justify-content:flex-end">${actions}</div></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

paymentsEl.addEventListener("click", async e => {
  const btn = e.target.closest("[data-pay]");
  if (!btn) return;
  const labels = { paid: "confirmar el cobrament de", failed: "marcar com a fallit", refunded: "marcar com a reemborsat" };
  const p = payments.find(x => x.id === btn.dataset.pay);
  if (!confirm(`Segur que vols ${labels[btn.dataset.status]} el pagament ${p.reference} (${fmtMoney(p.total)})?`)) return;
  btn.disabled = true;
  const { error } = await supabase.from("payments").update({ status: btn.dataset.status }).eq("id", p.id);
  if (error) { btn.disabled = false; return toast(error.message, "error"); }
  toast("Pagament actualitzat");
  await load();
});

// ---------- Clientes ----------
function renderUsers() {
  const rows = [...profiles.values()];
  if (!rows.length) { usersEl.innerHTML = `<div class="empty"><h3>No hi ha clients registrats</h3></div>`; return; }
  usersEl.innerHTML = `<table class="table">
    <thead><tr><th>Client</th><th>Contacte</th><th>Facturació</th><th class="num">Sol·licituds</th><th class="num">Pagat</th><th>Alta</th></tr></thead>
    <tbody>${rows.map(u => {
      const count = requests.filter(r => r.user_id === u.id).length;
      const paid = payments.filter(p => p.user_id === u.id && p.status === "paid").reduce((s, p) => s + Number(p.total), 0);
      return `<tr>
        <td><div class="cell-title">${escapeHtml(u.full_name || "Sense nom")} ${u.role === "admin" ? '<span class="badge badge-brand">Admin</span>' : ""}</div><div class="cell-sub">${escapeHtml(u.company || "Sense empresa")}</div></td>
        <td>${escapeHtml(u.phone || "—")}</td>
        <td><div>${escapeHtml(u.tax_id || "—")}</div><div class="cell-sub">${escapeHtml(u.city || "")}</div></td>
        <td class="num">${count}</td>
        <td class="num">${fmtMoney(paid)}</td>
        <td>${fmtDate(u.created_at)}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

// ---------- Pestañas ----------
document.querySelectorAll(".tab[data-tab]").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t === tab)));
  document.querySelectorAll("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== tab.dataset.tab));
}));

$("#refresh").addEventListener("click", load);
await load();
