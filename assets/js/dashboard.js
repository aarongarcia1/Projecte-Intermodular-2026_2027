import { supabase, requireUser, getProfile, signOut } from "./supabase-client.js";
import {
  initAppShell, escapeHtml, fmtMoney, fmtDate, fmtDateTime, shortRef, statusBadge, paymentBadge, badge,
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
  if (r.budget_amount == null) return `<div class="req-amount"><small>Import</small><b class="muted" style="font-size:1rem">Pendent</b></div>`;
  const t = calcTotals(r.budget_amount);
  return `<div class="req-amount"><small>Total (IVA incl.)</small><b>${fmtMoney(t.total)}</b><small>${fmtMoney(t.base)} + IVA</small></div>`;
}

function detailList(r) {
  const rows = [
    ["Contacte", r.contact_name], ["Correu", r.contact_email], ["Telèfon", r.contact_phone],
    ["Sector", r.sector], ["Mida", r.company_size], ["Urgència", URGENCY[r.urgency]],
    ["Pressupost orientatiu", r.budget_range], ["Data límit", r.deadline && fmtDate(r.deadline)],
    ["Entorn", r.audit_environment], ["Inici preferit", r.preferred_date && fmtDate(r.preferred_date)],
    ["Finestra de proves", r.time_slot]
  ].filter(([, v]) => v);
  return `<dl class="dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
}

function actions(r) {
  const pay = livePayment(r);
  if (r.status === "quoted") {
    const expired = r.quote_valid_until && new Date(r.quote_valid_until) < new Date(new Date().toDateString());
    if (expired) return `<span class="small muted">Pressupost caducat el ${fmtDate(r.quote_valid_until)}. Contacta amb nosaltres per renovar-lo.</span>`;
    return `${r.quote_valid_until ? `<span class="small muted">Vàlid fins al ${fmtDate(r.quote_valid_until)}</span>` : ""}
      <button class="btn btn-danger btn-sm" data-action="decline" data-id="${r.id}">Rebutja</button>
      <button class="btn btn-primary btn-sm" data-action="accept" data-id="${r.id}">Accepta el pressupost</button>`;
  }
  if (needsPayment(r)) {
    return `<a class="btn btn-primary btn-sm" href="pago.html?id=${r.id}">${pay?.status === "pending" ? "Completa el pagament" : "Paga ara"}</a>`;
  }
  if (pay?.status === "under_review") return `<span class="small muted">Estem verificant el teu pagament (${escapeHtml(PAYMENT_METHODS[pay.method]?.short || "")}).</span>`;
  if (pay?.status === "paid") return `<span class="small muted">Pagat el ${fmtDate(pay.paid_at)} · ${escapeHtml(pay.reference)}</span>`;
  return "";
}

function card(r) {
  const pay = livePayment(r);
  return `<article class="req">
    <div class="req-head">
      <div class="req-title">
        <span class="tag">${REQUEST_KIND[r.request_kind] || "Sol·licitud"} · <span class="mono">${shortRef(r.id)}</span></span>
        <h3>${escapeHtml(r.service_type)}</h3>
        <div class="req-meta">
          <span>${escapeHtml(r.company_name || "Sense empresa")}</span>
          <span>Creada el ${fmtDate(r.created_at)}</span>
          ${r.urgency && r.urgency !== "normal" ? `<span>Urgència ${escapeHtml(URGENCY[r.urgency] || r.urgency).toLowerCase()}</span>` : ""}
        </div>
      </div>
      ${amountBlock(r)}
    </div>
    <div class="req-body">
      ${timelineHtml(r.status)}
      ${r.admin_notes ? `<div class="note"><strong>Missatge d'Altercom21:</strong> ${escapeHtml(r.admin_notes)}</div>` : ""}
      <details class="more"><summary>Veure el detall de la sol·licitud</summary>
        ${detailList(r)}
        ${r.audit_scope ? `<p class="req-desc"><strong>Abast autoritzat</strong>\n${escapeHtml(r.audit_scope)}</p>` : ""}
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
      <h3>Encara no tens sol·licituds</h3><p>Demana un pressupost o una auditoria i fes-ne el seguiment des d'aquí.</p>
      <a class="btn btn-primary" href="solicitud.html">Crea la meva primera sol·licitud</a></div>`;
    return;
  }
  list.innerHTML = visible.length ? visible.map(card).join("")
    : `<div class="card empty"><h3>No hi ha sol·licituds en aquesta vista</h3><p>Prova amb una altra pestanya.</p></div>`;
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
      ? " Executa supabase/02_presupuestos_pagos.sql a l'SQL Editor de Supabase." : "";
    showMessage(msg, `No s'han pogut carregar les sol·licituds: ${error.message}.${hint}`, "error");
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
    if (!confirm(`Acceptes el pressupost de ${fmtMoney(t.total)} (IVA inclòs) per a «${r.service_type}»?\n\nTot seguit podràs triar el mètode de pagament.`)) return;
    btn.disabled = true;
    const { error } = await supabase.rpc("respond_quote", { p_request_id: r.id, p_accept: true });
    if (error) { btn.disabled = false; return toast(error.message, "error"); }
    location.href = `pago.html?id=${r.id}`;
  }

  if (btn.dataset.action === "decline") {
    const reason = prompt("Vols indicar-nos el motiu? (opcional)\n\nPrem Cancel·la per no rebutjar el pressupost.", "");
    if (reason === null) return;
    btn.disabled = true;
    const { error } = await supabase.rpc("respond_quote", { p_request_id: r.id, p_accept: false, p_note: reason });
    if (error) { btn.disabled = false; return toast(error.message, "error"); }
    toast("Pressupost rebutjat. Gràcies per la teva resposta.");
    await load();
  }
});

// ---------- Escaneos de la app NEXUS (supabase/03_nexus_app.sql) ----------
const nexusSection = document.querySelector("#nexus");
const nexusList = document.querySelector("#nexus-list");
let scans = [];

const RATING = {
  "BAIX": { label: "Risc baix", tone: "success" },
  "MODERAT": { label: "Risc moderat", tone: "warning" },
  "ALT": { label: "Risc alt", tone: "danger" },
  "CRÍTIC": { label: "Risc crític", tone: "danger" }
};
const LEVEL = {
  "CRÍTIC": { label: "Crític", tone: "danger" }, "ALT": { label: "Alt", tone: "danger" },
  "MITJÀ": { label: "Mitjà", tone: "warning" }, "BAIX": { label: "Baix", tone: "info" },
  "INFO": { label: "Info", tone: "neutral" }
};

function scanCard(s) {
  const r = RATING[s.rating] || { label: s.rating || "Sense valorar", tone: "neutral" };
  const ports = Array.isArray(s.open_ports) ? s.open_ports : [];
  const findings = Array.isArray(s.findings) ? s.findings : [];
  const counts = Object.keys(LEVEL).map(l => [l, findings.filter(f => f.level === l).length]).filter(([, n]) => n);
  const portRows = ports.map(p => `<tr><td class="mono">${Number(p.port)}/${escapeHtml(p.proto || "TCP")}</td>
      <td>${escapeHtml(p.service || "")}</td><td class="mono small">${escapeHtml(p.banner || "—")}</td></tr>`).join("");
  const findingRows = findings.map(f => `<li>${badge(LEVEL[f.level]?.label || f.level, LEVEL[f.level]?.tone || "neutral")}
      <strong>${escapeHtml(f.title)}</strong>${f.port ? ` <span class="muted">· port ${Number(f.port)}</span>` : ""}
      <div class="small muted">${escapeHtml(f.remediation || "")}</div></li>`).join("");
  return `<article class="req">
    <div class="req-head">
      <div class="req-title">
        <span class="tag">NEXUS · <span class="mono">ESC-${escapeHtml(String(s.id).slice(0, 8).toUpperCase())}</span></span>
        <h3>${escapeHtml(s.target)}</h3>
        <div class="req-meta">
          <span class="mono">${escapeHtml(s.ip || "")}</span>
          <span>${fmtDateTime(s.started_at || s.created_at)}</span>
          <span>${Number(s.ports_scanned) || 0} ports analitzats</span>
          ${s.completed ? "" : "<span>Escaneig interromput</span>"}
        </div>
      </div>
      <div class="req-amount"><small>Puntuació de risc</small><b>${Number(s.score) || 0}/100</b><small>${badge(r.label, r.tone)}</small></div>
    </div>
    <div class="req-body">
      <details class="more"><summary>Ver ${ports.length} ports oberts i ${findings.length} troballes</summary>
        ${ports.length ? `<div class="table-wrap"><table class="nexus-table"><thead><tr><th>Port</th><th>Servei</th><th>Banner</th></tr></thead><tbody>${portRows}</tbody></table></div>` : `<p class="muted">No s'han detectat ports oberts.</p>`}
        ${findings.length ? `<ul class="nexus-findings">${findingRows}</ul>` : ""}
      </details>
    </div>
    <div class="req-foot">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${badge(`${ports.length} ports oberts`, "brand")}${counts.map(([l, n]) => badge(`${n} ${LEVEL[l].label.toLowerCase()}`, LEVEL[l].tone)).join("")}</div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-scan-action="delete" data-id="${escapeHtml(s.id)}">Elimina</button>
        <a class="btn btn-primary btn-sm" href="solicitud.html">Demana una auditoria</a>
      </div>
    </div>
  </article>`;
}

function renderScans() {
  document.querySelector("#nexus-count").textContent = scans.length;
  nexusList.innerHTML = scans.length ? scans.map(scanCard).join("")
    : `<div class="card empty"><div class="icon-box"><svg class="i"><use href="assets/img/icons.svg#shield-check"/></svg></div>
      <h3>Encara no has sincronitzat cap escaneig</h3>
      <p>Obre l'app NEXUS, inicia la sessió amb aquest compte i puja un escaneig (o activa la pujada automàtica).</p></div>`;
}

async function loadScans() {
  const { data, error } = await supabase
    .from("nexus_scans")
    .select("id,target,ip,score,rating,ports_scanned,open_ports,findings,completed,started_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // Si todavía no se ha ejecutado supabase/03_nexus_app.sql la sección permanece oculta.
    console.info("Escanejos NEXUS no disponibles:", error.message);
    return;
  }
  scans = data || [];
  nexusSection.hidden = false;
  renderScans();
}

nexusList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-scan-action]");
  if (!btn) return;
  const s = scans.find(x => x.id === btn.dataset.id);
  if (!s || !confirm(`Vols eliminar l'escaneig de ${s.target}? També desapareixerà de l'app NEXUS.`)) return;
  btn.disabled = true;
  const { error } = await supabase.from("nexus_scans").delete().eq("id", s.id);
  if (error) { btn.disabled = false; return toast(error.message, "error"); }
  scans = scans.filter(x => x.id !== s.id);
  renderScans();
  toast("Escaneig eliminat.");
});

await load();
await loadScans();
if (location.hash === "#nexus" && !nexusSection.hidden) nexusSection.scrollIntoView({ behavior: "smooth" });
