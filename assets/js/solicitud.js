import { supabase, getProfile, signOut } from "./supabase-client.js";
import { initAppShell, showMessage, shortRef } from "./ui.js";

const DRAFT_KEY = "altercom21:solicitud";
const form = document.querySelector("#request-form");
const msg = document.querySelector("#form-message");
const draftNote = document.querySelector("#draft-note");
const tabs = document.querySelectorAll(".segmented [data-kind]");
const params = new URLSearchParams(location.search);

document.querySelector("#logout").addEventListener("click", signOut);

// ---------- Sesión (la página se puede rellenar sin haber iniciado sesión) ----------
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user || null;
let profile = null;
if (user) {
  profile = await getProfile(user.id);
  document.querySelector("#auth-hint").textContent = `Enviaràs la sol·licitud com a ${user.email}.`;
} else {
  document.querySelectorAll("[data-member]").forEach(el => (el.hidden = true));
  document.querySelectorAll("[data-guest]").forEach(el => (el.hidden = false));
}
initAppShell(profile, user);

// ---------- Fechas mínimas ----------
const today = new Date();
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
form.elements.deadline.min = iso(today);
form.elements.preferred_date.min = iso(new Date(today.getTime() + 2 * 86400000)); // margen para firmar el alcance

// ---------- Cambio Presupuesto / Auditoría ----------
function setKind(kind) {
  form.elements.request_kind.value = kind;
  tabs.forEach(t => t.setAttribute("aria-selected", String(t.dataset.kind === kind)));
  document.querySelectorAll("[data-for]").forEach(el => (el.hidden = el.dataset.for !== kind));
}
tabs.forEach(t => t.addEventListener("click", () => setKind(t.dataset.kind)));

// ---------- Contador de caracteres ----------
document.querySelectorAll("[data-count]").forEach(counter => {
  const field = form.elements[counter.dataset.count];
  const update = () => (counter.textContent = field.value.length);
  field.addEventListener("input", update);
  update();
});

// ---------- Borrador (para no perder datos si hay que iniciar sesión) ----------
function serialize() {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}
function restore(data) {
  for (const el of form.elements) {
    if (!el.name || !(el.name in data)) continue;
    if (el.type === "checkbox") el.checked = data[el.name].includes(el.value);
    else if (el.type === "radio") el.checked = data[el.name] === el.value;
    else el.value = data[el.name];
  }
  setKind(data.request_kind || "budget");
  form.querySelectorAll("textarea").forEach(t => t.dispatchEvent(new Event("input")));
}

let draft = null;
try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* sin almacenamiento */ }

if (draft) {
  restore(draft);
  if (user) {
    draftNote.hidden = false;
    draftNote.textContent = "Hem recuperat la sol·licitud que estaves preparant. Revisa-la i prem «Envia la sol·licitud».";
  }
} else {
  const tipo = params.get("tipo");
  setKind(tipo === "auditoria" ? "audit" : "budget");
  const plan = params.get("plan");
  if (plan) {
    const norm = v => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const radio = [...form.elements.plan].find(r => norm(r.value) === norm(plan));
    if (radio) radio.checked = true;
  }
  if (params.get("servicio")) form.elements.service.value = params.get("servicio");
}

// Datos de contacto del perfil.
if (user) {
  const fill = (name, value) => { if (!form.elements[name].value && value) form.elements[name].value = value; };
  fill("contact_name", profile?.full_name);
  fill("contact_email", user.email);
  fill("contact_phone", profile?.phone);
  fill("company_name", profile?.company);
}

// ---------- Validación ----------
function validate(kind) {
  const f = form.elements;
  const errors = [];
  const need = (el, text) => { if (!String(el.value).trim()) { errors.push(text); el.setAttribute("aria-invalid", "true"); } else el.removeAttribute("aria-invalid"); };
  need(f.contact_name, "nom de contacte");
  need(f.company_name, "empresa");
  if (!f.contact_email.value.trim() || !f.contact_email.checkValidity()) { errors.push("un correu electrònic vàlid"); f.contact_email.setAttribute("aria-invalid", "true"); }
  else f.contact_email.removeAttribute("aria-invalid");

  if (kind === "budget") {
    need(f.service, "servei d'interès");
    if (f.description_b.value.trim().length < 30) { errors.push("descripció del projecte (mínim 30 caràcters)"); f.description_b.setAttribute("aria-invalid", "true"); }
    else f.description_b.removeAttribute("aria-invalid");
  } else {
    if (!form.querySelectorAll('input[name="tests"]:checked').length) errors.push("almenys una prova a fer");
    need(f.audit_scope, "abast autoritzat");
    need(f.preferred_date, "data d'inici preferida");
    if (!f.authorization.checked) errors.push("declaració d'autorització");
  }
  if (!f.privacy.checked) errors.push("acceptació del tractament de dades");
  return errors;
}

// ---------- Construcción del registro ----------
function buildPayload(kind) {
  const f = form.elements;
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  const val = name => String(f[name].value || "").trim() || null;
  const base = {
    user_id: user.id,
    request_kind: kind,
    company_name: val("company_name"),
    contact_name: val("contact_name"),
    contact_email: val("contact_email"),
    contact_phone: val("contact_phone"),
    sector: val("sector"),
    company_size: val("company_size")
  };

  if (kind === "budget") {
    const compliance = checked("compliance");
    const text = [f.description_b.value.trim(), compliance.length ? `\nRequisits normatius: ${compliance.join(", ")}` : ""].join("");
    return {
      ...base,
      service_type: val("service"),
      urgency: checked("urgency_b")[0] || "normal",
      budget_range: val("budget_range"),
      deadline: val("deadline"),
      description: text
    };
  }

  const plan = checked("plan")[0] || "A mida";
  const tests = checked("tests");
  const notes = f.description_a.value.trim();
  return {
    ...base,
    service_type: `Auditoria ${plan}`,
    urgency: checked("urgency_a")[0] || "normal",
    audit_scope: val("audit_scope"),
    audit_environment: val("audit_environment"),
    preferred_date: val("preferred_date"),
    time_slot: val("time_slot"),
    authorization_confirmed: f.authorization.checked,
    description: [
      `Proves sol·licitades: ${tests.join(", ")}`,
      `Nombre aproximat d'actius: ${f.assets.value}`,
      notes ? `\nObservacions:\n${notes}` : ""
    ].join("\n").trim()
  };
}

// ---------- Envío ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const kind = form.elements.request_kind.value;
  const errors = validate(kind);
  if (errors.length) {
    showMessage(msg, `Revisa aquests camps: ${errors.join(", ")}.`, "error");
    msg.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (!user) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(serialize())); } catch { /* sin almacenamiento */ }
    location.href = "login.html?next=" + encodeURIComponent("solicitud.html");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(msg, "Enviant la sol·licitud…", "info");

  const { data, error } = await supabase.from("audit_requests").insert(buildPayload(kind)).select("id").single();
  button.disabled = false;

  if (error) {
    const hint = /column|schema cache/i.test(error.message)
      ? " (Has executat supabase/02_presupuestos_pagos.sql a Supabase?)" : "";
    showMessage(msg, `No s'ha pogut enviar la sol·licitud: ${error.message}${hint}`, "error");
    return;
  }

  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento */ }
  form.hidden = true;
  draftNote.hidden = true;
  document.querySelector(".card-head .segmented").hidden = true;
  document.querySelector("#success-ref").textContent = shortRef(data.id);
  document.querySelector("#success").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
