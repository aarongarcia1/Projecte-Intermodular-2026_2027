// Utilidades de interfaz compartidas por todas las páginas.
import { PAYMENT_CONFIG } from "./config.js";

export const REQUEST_STATUS = {
  received:    { label: "Recibida",            tone: "neutral" },
  reviewing:   { label: "En revisión",         tone: "info" },
  quoted:      { label: "Presupuesto enviado", tone: "warning" },
  accepted:    { label: "Presupuesto aceptado", tone: "info" },
  declined:    { label: "Presupuesto rechazado", tone: "neutral" },
  in_progress: { label: "En curso",            tone: "brand" },
  completed:   { label: "Completada",          tone: "success" },
  rejected:    { label: "Descartada",          tone: "danger" }
};

export const PAYMENT_STATUS = {
  pending:      { label: "Pendiente de pago",   tone: "warning" },
  under_review: { label: "Verificando pago",    tone: "info" },
  paid:         { label: "Pagado",              tone: "success" },
  failed:       { label: "Pago fallido",        tone: "danger" },
  refunded:     { label: "Reembolsado",         tone: "neutral" },
  cancelled:    { label: "Cancelado",           tone: "neutral" }
};

export const PAYMENT_METHODS = {
  transfer: { label: "Transferencia bancaria", short: "Transferencia" },
  bizum:    { label: "Bizum",                  short: "Bizum" },
  card:     { label: "Tarjeta de crédito o débito", short: "Tarjeta" }
};

export const REQUEST_KIND = { budget: "Presupuesto", audit: "Auditoría" };

export const URGENCY = {
  low: "Baja", normal: "Normal", high: "Alta", critical: "Crítica"
};

// Flujo que ve el cliente en la línea de tiempo de cada solicitud.
const FLOW = ["received", "reviewing", "quoted", "accepted", "in_progress", "completed"];
const FLOW_LABELS = ["Recibida", "Análisis", "Presupuesto", "Aceptado", "En curso", "Entregado"];

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

export const fmtMoney = (n) => (n == null || n === "" ? "—" : money.format(Number(n)));
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
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

export function showMessage(el, message, kind = "") {
  if (!el) return;
  el.textContent = message;
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
  t.textContent = message;
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
  const name = profile?.full_name || user?.email || "Mi cuenta";
  document.querySelectorAll("[data-user-name]").forEach(el => (el.textContent = name));
  document.querySelectorAll("[data-user-initials]").forEach(el => {
    el.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "A";
  });
  if (profile?.role === "admin") {
    document.querySelectorAll("[data-admin-only]").forEach(el => (el.hidden = false));
  }
}

initNav();
