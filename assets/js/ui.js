// Utilidades de interfaz compartidas por todas las páginas.
import { PAYMENT_CONFIG } from "./config.js";

export const REQUEST_STATUS = {
  received:    { label: "Rebuda",            tone: "neutral" },
  reviewing:   { label: "En revisió",         tone: "info" },
  quoted:      { label: "Pressupost enviat", tone: "warning" },
  accepted:    { label: "Pressupost acceptat", tone: "info" },
  declined:    { label: "Pressupost rebutjat", tone: "neutral" },
  in_progress: { label: "En curs",            tone: "brand" },
  completed:   { label: "Completada",          tone: "success" },
  rejected:    { label: "Descartada",          tone: "danger" }
};

export const PAYMENT_STATUS = {
  pending:      { label: "Pendent de pagament",   tone: "warning" },
  under_review: { label: "Verificant el pagament",    tone: "info" },
  paid:         { label: "Pagat",              tone: "success" },
  failed:       { label: "Pagament fallit",        tone: "danger" },
  refunded:     { label: "Reemborsat",         tone: "neutral" },
  cancelled:    { label: "Cancel·lat",           tone: "neutral" }
};

export const PAYMENT_METHODS = {
  transfer: { label: "Transferència bancària", short: "Transferència" },
  bizum:    { label: "Bizum",                  short: "Bizum" },
  card:     { label: "Targeta de crèdit o dèbit", short: "Targeta" }
};

export const REQUEST_KIND = { budget: "Pressupost", audit: "Auditoria" };

export const URGENCY = {
  low: "Baixa", normal: "Normal", high: "Alta", critical: "Crítica"
};

// Flujo que ve el cliente en la línea de tiempo de cada solicitud.
const FLOW = ["received", "reviewing", "quoted", "accepted", "in_progress", "completed"];
const FLOW_LABELS = ["Rebuda", "Anàlisi", "Pressupost", "Acceptat", "En curs", "Lliurat"];

const money = new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR" });

export function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

export const fmtMoney = (n) => (n == null || n === "" ? "—" : money.format(Number(n)));
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("ca-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const shortRef = (id = "") => "SOL-" + String(id).slice(0, 8).toUpperCase();

export function badge(label, tone = "neutral") {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}
export function statusBadge(status) {
  const s = REQUEST_STATUS[status] || { label: status, tone: "neutral" };
  return badge(s.label, s.tone);
}
export function paymentBadge(status) {
  const s = PAYMENT_STATUS[status] || { label: status, tone: "neutral" };
  return badge(s.label, s.tone);
}

export function calcTotals(subtotal, vatRate = PAYMENT_CONFIG.vatRate) {
  const base = Number(subtotal) || 0;
  const vat = Math.round(base * vatRate) / 100;
  return { base, vatRate, vat, total: Math.round((base + vat) * 100) / 100 };
}

export function timelineHtml(status) {
  if (status === "rejected" || status === "declined") {
    return `<div class="timeline-note">${statusBadge(status)}</div>`;
  }
  const current = FLOW.indexOf(status);
  return `<ol class="timeline">${FLOW.map((step, i) => {
    const state = i < current ? "done" : i === current ? "current" : "";
    return `<li class="${state}"><span></span>${FLOW_LABELS[i]}</li>`;
  }).join("")}</ol>`;
}

export function isMethodAvailable(method) {
  if (method === "transfer") return Boolean(PAYMENT_CONFIG.transfer?.iban);
  if (method === "bizum") return Boolean(PAYMENT_CONFIG.bizum?.phone);
  if (method === "card") return Boolean(PAYMENT_CONFIG.card?.paymentUrl);
  return false;
}

// Missatges d'error de la base de dades (supabase/*.sql) i de Supabase Auth, en català.
const ERRORS = {
  "Solicitud no encontrada.": "No s'ha trobat la sol·licitud.",
  "Este presupuesto no está pendiente de respuesta.": "Aquest pressupost no està pendent de resposta.",
  "El presupuesto ha caducado. Solicita uno actualizado.": "El pressupost ha caducat. Demana'n un d'actualitzat.",
  "Método de pago no válido.": "Mètode de pagament no vàlid.",
  "Completa los datos de facturación.": "Completa les dades de facturació.",
  "Primero debes aceptar el presupuesto.": "Primer has d'acceptar el pressupost.",
  "La solicitud todavía no tiene importe.": "La sol·licitud encara no té import.",
  "Esta solicitud ya está pagada.": "Aquesta sol·licitud ja està pagada.",
  "Ya hay un pago pendiente de verificación para esta solicitud.": "Ja hi ha un pagament pendent de verificació per a aquesta sol·licitud.",
  "No se ha encontrado un pago pendiente con ese identificador.": "No s'ha trobat cap pagament pendent amb aquest identificador.",
  "Indica el importe antes de enviar el presupuesto.": "Indica l'import abans d'enviar el pressupost.",
  "No se puede cambiar el propietario ni la fecha de creación de una solicitud.": "No es pot canviar el propietari ni la data de creació d'una sol·licitud.",
  "User already registered": "Ja existeix un compte amb aquest correu.",
  "Password should be at least 6 characters": "La contrasenya ha de tenir almenys 6 caràcters.",
  "Unable to validate email address: invalid format": "El format del correu no és vàlid.",
  "Email rate limit exceeded": "S'han enviat massa correus. Torna-ho a provar d'aquí a una estona.",
  "New password should be different from the old password.": "La contrasenya nova ha de ser diferent de l'anterior.",
  "Auth session missing!": "La sessió ha caducat. Torna a obrir l'enllaç del correu.",
  "Failed to fetch": "No s'ha pogut connectar amb el servidor. Comprova la connexió."
};
export function translateError(text = "") {
  let out = String(text ?? "");
  for (const [es, ca] of Object.entries(ERRORS)) out = out.split(es).join(ca);
  return out;
}

export function showMessage(el, message, kind = "") {
  if (!el) return;
  el.textContent = translateError(message);
  el.className = `alert ${kind ? "alert-" + kind : ""}`.trim();
  el.hidden = !message;
}

export function toast(message, kind = "success") {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${kind}`;
  t.textContent = translateError(message);
  host.append(t);
  setTimeout(() => t.classList.add("out"), 3600);
  setTimeout(() => t.remove(), 4000);
}

// Menú móvil de la cabecera.
let navReady = false;
export function initNav() {
  if (navReady) return;
  navReady = true;
  const toggle = document.querySelector(".nav-toggle");
  const header = document.querySelector(".site-header, .app-header");
  if (!toggle || !header) return;
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  header.querySelectorAll(".main-nav a").forEach(a =>
    a.addEventListener("click", () => header.classList.remove("open")));
}

// Cabecera de las páginas privadas: nombre del usuario y enlace de administración.
export function initAppShell(profile, user) {
  initNav();
  const name = profile?.full_name || user?.email || "El meu compte";
  document.querySelectorAll("[data-user-name]").forEach(el => (el.textContent = name));
  document.querySelectorAll("[data-user-initials]").forEach(el => {
    el.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "A";
  });
  if (profile?.role === "admin") {
    document.querySelectorAll("[data-admin-only]").forEach(el => (el.hidden = false));
  }
}

initNav();
