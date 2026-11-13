import { supabase, requireUser, getProfile, signOut } from "./supabase-client.js";
import { PAYMENT_CONFIG } from "./config.js";
import {
  initAppShell, escapeHtml, fmtMoney, fmtDate, shortRef, calcTotals, paymentBadge,
  showMessage, toast, isMethodAvailable, PAYMENT_METHODS
} from "./ui.js";

const $ = s => document.querySelector(s);
const msg = $("#pay-message");
const form = $("#pay-form");
const instructions = $("#instructions");
const done = $("#done");

$("#logout").addEventListener("click", signOut);

const user = await requireUser();
const profile = await getProfile(user.id);
initAppShell(profile, user);

const requestId = new URLSearchParams(location.search).get("id");
let request = null;
let payment = null;

function fail(text) {
  $("#pay-sub").textContent = "";
  showMessage(msg, text, "error");
  msg.insertAdjacentHTML("beforeend", ' <a href="dashboard.html">Torna a les meves sol·licituds</a>');
}

function show(step) {
  form.hidden = step !== "form";
  instructions.hidden = step !== "instructions";
  done.hidden = step !== "done";
}

function renderSummary() {
  const t = payment
    ? { base: payment.subtotal, vat: payment.vat_amount, vatRate: payment.vat_rate, total: payment.total }
    : calcTotals(request.budget_amount);
  $("#sum-title").textContent = request.service_type;
  $("#sum-ref").textContent = payment?.reference || shortRef(request.id);
  $("#sum-company").textContent = request.company_name || "—";
  $("#sum-base").textContent = fmtMoney(t.base);
  $("#sum-vat-label").textContent = `IVA (${Number(t.vatRate)} %)`;
  $("#sum-vat").textContent = fmtMoney(t.vat);
  $("#sum-total").textContent = fmtMoney(t.total);
}

const copyBtn = value => `<button type="button" class="copy-btn" data-copy="${escapeHtml(value)}">Copia</button>`;
const row = (label, value, copy = false) =>
  `<div class="row"><span>${label}</span><b>${escapeHtml(value)}${copy ? copyBtn(value) : ""}</b></div>`;

function renderInstructions() {
  const m = payment.method;
  const amount = fmtMoney(payment.total);
  $("#ins-title").textContent = PAYMENT_METHODS[m].label;
  $("#ins-badge").innerHTML = paymentBadge(payment.status);
  let html = "";

  if (m === "transfer") {
    const c = PAYMENT_CONFIG.transfer;
    html = `<p>Fes una transferència amb aquestes dades. <strong>Indica la referència exactament al concepte</strong> perquè puguem identificar el pagament.</p>
      <div class="pay-instructions">
        ${row("Beneficiari", c.beneficiary)}
        ${row("IBAN", c.iban, true)}
        ${c.bic ? row("BIC / SWIFT", c.bic, true) : ""}
        ${c.bank ? row("Entitat", c.bank) : ""}
        ${row("Concepte", payment.reference, true)}
        ${row("Import", amount)}
      </div>
      <p class="small muted" style="margin-top:14px">Les transferències solen trigar 1–2 dies hàbils. Quan la rebem, l'estat canviarà a «Pagat».</p>`;
  } else if (m === "bizum") {
    html = `<p>Envia un Bizum des de l'app del teu banc amb aquestes dades:</p>
      <div class="pay-instructions">
        ${row("Telèfon", PAYMENT_CONFIG.bizum.phone, true)}
        ${row("Concepte", payment.reference, true)}
        ${row("Import", amount)}
      </div>
      <p class="small muted" style="margin-top:14px">Si l'import supera el límit de Bizum del teu banc, tria transferència bancària.</p>`;
  } else if (m === "card") {
    const url = new URL(PAYMENT_CONFIG.card.paymentUrl);
    url.searchParams.set("client_reference_id", payment.reference);
    url.searchParams.set("prefilled_email", user.email || "");
    html = `<p>Et redirigirem a la nostra passarel·la de pagament segura. Paga l'import indicat i torna a aquesta pàgina.</p>
      <div class="pay-instructions">
        ${row("Referència", payment.reference, true)}
        ${row("Import", amount)}
      </div>
      <p style="margin-top:18px"><a class="btn btn-dark btn-lg" href="${escapeHtml(url.href)}" target="_blank" rel="noopener">
        <svg class="i"><use href="assets/img/icons.svg#card"/></svg>Pagar ${amount} amb targeta
        <svg class="i"><use href="assets/img/icons.svg#external"/></svg></a></p>
      <p class="small muted">Altercom21 no rep ni guarda les dades de la teva targeta.</p>`;
  }
  $("#ins-body").innerHTML = html;
  show("instructions");
}

function renderDone() {
  const paid = payment.status === "paid";
  $("#done-title").textContent = paid ? "Pagament confirmat" : "Pagament registrat";
  $("#done-text").textContent = paid
    ? `Hem rebut el pagament de ${fmtMoney(payment.total)} el ${fmtDate(payment.paid_at)}. Referència ${payment.reference}.`
    : `Gràcies. Estem verificant el teu pagament de ${fmtMoney(payment.total)} (referència ${payment.reference}). T'avisarem quan es confirmi.`;
  show("done");
}

// ---------- Carga ----------
if (!requestId) {
  fail("No s'ha indicat cap sol·licitud.");
} else {
  const { data, error } = await supabase
    .from("audit_requests")
    .select("id,service_type,company_name,status,budget_amount,payments(*)")
    .eq("id", requestId)
    .maybeSingle();

  if (error) fail(`No s'ha pogut carregar la sol·licitud: ${error.message}`);
  else if (!data) fail("No s'ha trobat la sol·licitud o no hi tens accés.");
  else if (data.status === "quoted") fail("Primer has d'acceptar el pressupost des de la teva àrea de client.");
  else if (!["accepted", "in_progress", "completed"].includes(data.status) || data.budget_amount == null) fail("Aquesta sol·licitud no té cap pressupost pendent de pagament.");
  else {
    request = data;
    payment = (data.payments || []).find(p => ["pending", "under_review", "paid"].includes(p.status)) || null;
    $("#pay-sub").textContent = `${data.service_type} · ${shortRef(data.id)}`;
    $("#checkout").hidden = false;
    renderSummary();

    // Datos de facturación: los del último pago o los del perfil.
    const address = [profile?.billing_address, [profile?.postal_code, profile?.city].filter(Boolean).join(" "), profile?.country]
      .filter(Boolean).join(", ");
    form.elements.billing_name.value = payment?.billing_name || profile?.company || profile?.full_name || "";
    form.elements.billing_tax_id.value = payment?.billing_tax_id || profile?.tax_id || "";
    form.elements.billing_address.value = payment?.billing_address || address;

    // Métodos no configurados.
    form.querySelectorAll('input[name="method"]').forEach(input => {
      if (!isMethodAvailable(input.value)) {
        input.disabled = true;
        input.closest(".option").querySelector("small").textContent = "No disponible ara mateix.";
      }
    });
    const preferred = payment?.method || ["transfer", "bizum", "card"].find(isMethodAvailable);
    const radio = form.querySelector(`input[name="method"][value="${preferred}"]`);
    if (radio && !radio.disabled) radio.checked = true;

    if (payment?.status === "paid" || payment?.status === "under_review") renderDone();
    else if (payment?.status === "pending" && isMethodAvailable(payment.method)) renderInstructions();
    else show("form");
  }
}

// ---------- Eventos ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const fd = new FormData(form);
  if (!fd.get("method")) return showMessage(msg, "Tria un mètode de pagament.", "error");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(msg, "", "");
  const { data, error } = await supabase.rpc("create_payment", {
    p_request_id: request.id,
    p_method: fd.get("method"),
    p_billing_name: String(fd.get("billing_name")).trim(),
    p_billing_tax_id: String(fd.get("billing_tax_id")).trim(),
    p_billing_address: String(fd.get("billing_address")).trim()
  });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  payment = data;
  renderSummary();
  renderInstructions();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#change-method").addEventListener("click", () => show("form"));

$("#mark-sent").addEventListener("click", async (e) => {
  const button = e.currentTarget;
  if (!confirm("Confirmes que ja has fet el pagament? El verificarem i t'avisarem.")) return;
  button.disabled = true;
  const { data, error } = await supabase.rpc("mark_payment_sent", { p_payment_id: payment.id });
  button.disabled = false;
  if (error) return toast(error.message, "error");
  payment = data;
  renderDone();
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    toast("Copiat al porta-retalls");
  } catch {
    toast("No s'ha pogut copiar", "error");
  }
});
