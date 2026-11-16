import { supabase, requireUser, getProfile, signOut } from "./supabase-client.js";
import { PAYMENT_CONFIG, SUPABASE_ANON_KEY } from "./config.js";
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
  $("#mark-sent").hidden = m === "redsys"; // Redsys confirma el pagament automàticament

  if (m === "redsys") {
    html = `<p>Pagaràs amb targeta al <strong>TPV segur de Redsys</strong>, la plataforma de pagaments dels bancs espanyols. En acabar tornaràs aquí i el pagament es confirmarà automàticament.</p>
      <div class="pay-instructions">
        ${row("Referència", payment.reference)}
        ${row("Import", amount)}
      </div>
      ${PAYMENT_CONFIG.redsys.testMode ? `<div class="alert alert-warning" style="margin-top:16px"><strong>Mode de proves:</strong> no es cobren diners reals. Fes servir la targeta de proves <span class="mono">4548 8100 0000 0003</span>, caducitat <span class="mono">12/49</span> i CVV <span class="mono">123</span>.</div>` : ""}
      <p style="margin-top:18px"><button type="button" class="btn btn-dark btn-lg" id="redsys-pay">
        <svg class="i"><use href="assets/img/icons.svg#lock"/></svg>Paga ${amount} amb targeta</button></p>
      <p class="small muted">Les dades de la targeta s'introdueixen només a la pàgina de Redsys. Altercom21 no les rep ni les guarda.</p>`;
  } else if (m === "transfer") {
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
    const revolut = /(^|\.)revolut\.me$/.test(url.hostname);
    if (!revolut) {
      // Stripe Payment Link: referència i correu per identificar el pagament.
      url.searchParams.set("client_reference_id", payment.reference);
      url.searchParams.set("prefilled_email", user.email || "");
    }
    const plain = Number(payment.total).toFixed(2).replace(".", ",");
    html = revolut
      ? `<p>Pagaràs a través de <strong>Revolut</strong>, amb targeta de crèdit o dèbit, Apple Pay, Google Pay o el teu compte de Revolut.</p>
      <ol class="small" style="margin:0 0 4px;padding-left:20px;display:grid;gap:4px">
        <li>Prem el botó per obrir la pàgina de pagament de Revolut.</li>
        <li>Escriu <strong>exactament</strong> l'import indicat.</li>
        <li>Escriu la <strong>referència</strong> a la nota del pagament perquè el puguem identificar.</li>
      </ol>
      <div class="pay-instructions">
        ${row("Import", plain + " €", true)}
        ${row("Referència per a la nota", payment.reference, true)}
      </div>
      <p style="margin-top:18px"><a class="btn btn-dark btn-lg" href="${escapeHtml(url.href)}" target="_blank" rel="noopener">
        <svg class="i"><use href="assets/img/icons.svg#card"/></svg>Paga ${amount} amb Revolut
        <svg class="i"><use href="assets/img/icons.svg#external"/></svg></a></p>
      <p class="small muted">El pagament es fa a la pàgina segura de Revolut. Altercom21 no rep ni guarda les dades de la teva targeta.</p>`
      : `<p>Et redirigirem a la nostra passarel·la de pagament segura. Paga l'import indicat i torna a aquesta pàgina.</p>
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

// ---------- Passarel·la Redsys ----------
async function startRedsys(button) {
  button.disabled = true;
  showMessage(msg, "Connectant amb el TPV segur…", "info");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${PAYMENT_CONFIG.redsys.endpoint}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ payment_id: payment.id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    // Formulari que s'envia directament a Redsys (el client hi entra les dades de la targeta).
    const f = document.createElement("form");
    f.method = "POST";
    f.action = data.url;
    for (const name of ["Ds_SignatureVersion", "Ds_MerchantParameters", "Ds_Signature"]) {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = data[name];
      f.append(input);
    }
    document.body.append(f);
    f.submit();
  } catch (err) {
    button.disabled = false;
    const text = /Failed to fetch|NetworkError/i.test(err.message)
      ? "No s'ha pogut connectar amb la passarel·la. Comprova que la funció «redsys» està instal·lada a Supabase."
      : err.message;
    showMessage(msg, text, "error");
  }
}

// Retorn des de Redsys: la confirmació arriba per un altre camí (notificació al servidor), així que s'espera.
async function waitForRedsys() {
  showMessage(msg, "Estem confirmant el pagament amb el banc…", "info");
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const { data } = await supabase.from("payments").select("*").eq("id", payment.id).maybeSingle();
    if (data?.status === "paid") { payment = data; showMessage(msg, "", ""); renderSummary(); renderDone(); return; }
    if (data?.status === "failed") { showMessage(msg, "El banc ha denegat el pagament. Pots tornar-ho a provar amb una altra targeta.", "error"); payment = null; show("form"); return; }
  }
  showMessage(msg, "El banc encara no ha confirmat el pagament. Torna a carregar aquesta pàgina d'aquí a uns minuts.", "warning");
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
        input.closest(".option").hidden = true; // mètode no configurat: no es mostra
      }
    });
    const preferred = payment?.method || ["redsys", "transfer", "bizum", "card"].find(isMethodAvailable);
    const radio = form.querySelector(`input[name="method"][value="${preferred}"]`);
    if (radio && !radio.disabled) radio.checked = true;

    const redsysResult = new URLSearchParams(location.search).get("redsys");
    if (payment?.status === "paid" || payment?.status === "under_review") renderDone();
    else if (payment?.status === "pending" && isMethodAvailable(payment.method)) {
      renderInstructions();
      if (payment.method === "redsys" && redsysResult === "ok") waitForRedsys();
      if (payment.method === "redsys" && redsysResult === "ko") showMessage(msg, "El pagament amb targeta no s'ha completat. Pots tornar-ho a provar.", "error");
    } else {
      show("form");
      if (redsysResult === "ko") showMessage(msg, "El pagament amb targeta no s'ha completat. Pots tornar-ho a provar.", "error");
    }
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

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#redsys-pay");
  if (btn) startRedsys(btn);
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
