import { supabase, requireUser, signOut, showMessage, escapeHtml } from "./supabase-client.js";
const welcome = document.querySelector("#welcome");
const list = document.querySelector("#requests");
const form = document.querySelector("#request-form");
const msg = document.querySelector("#request-message");
document.querySelector("#logout").addEventListener("click", signOut);
document.querySelector("#refresh").addEventListener("click", loadRequests);
const user = await requireUser();
const { data: profile } = await supabase.from("profiles").select("full_name,role").eq("id", user.id).maybeSingle();
welcome.textContent = `Hola${profile?.full_name ? ", " + profile.full_name : ""}. Aquí puedes gestionar tus solicitudes.`;
if (profile?.role === "admin") {
  const link = document.createElement("a"); link.className = "btn secondary"; link.href = "admin.html"; link.textContent = "Panel de administración";
  document.querySelector(".page-heading .actions")?.append(link);
  const heading = document.querySelector(".page-heading");
  if (heading && !heading.querySelector('a[href="admin.html"]')) heading.append(link);
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Enviando solicitud…");
  const { error } = await supabase.from("audit_requests").insert({
    user_id: user.id, service_type: fd.get("service_type"),
    company_name: fd.get("company_name").trim() || null,
    description: fd.get("description").trim()
  });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  form.reset(); showMessage(msg, "Solicitud enviada correctamente.", "success"); await loadRequests();
});
function statusLabel(s) {
  return ({received:"Recibida", reviewing:"En revisión", quoted:"Presupuesto enviado", in_progress:"En curso", completed:"Completada", rejected:"Rechazada"})[s] || s;
}
async function loadRequests() {
  list.innerHTML = '<p class="muted">Cargando…</p>';
  const { data, error } = await supabase.from("audit_requests").select("id,service_type,company_name,description,status,budget_amount,admin_notes,created_at,updated_at").order("created_at",{ascending:false});
  if (error) { list.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`; return; }
  if (!data?.length) { list.innerHTML = '<p class="muted">Todavía no tienes solicitudes. Usa el formulario de arriba para crear la primera.</p>'; return; }
  list.innerHTML = data.map(r => `<article class="request-card"><div class="request-top"><div><span class="pill">${escapeHtml(statusLabel(r.status))}</span><h3>${escapeHtml(r.service_type)}</h3><p class="muted">${escapeHtml(r.company_name || "Sin empresa indicada")} · ${new Date(r.created_at).toLocaleDateString("es-ES")}</p></div><strong>${r.budget_amount == null ? "Presupuesto pendiente" : new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(r.budget_amount)}</strong></div><p class="request-description">${escapeHtml(r.description)}</p>${r.admin_notes ? `<p class="admin-note"><strong>Nota de Altercom21:</strong> ${escapeHtml(r.admin_notes)}</p>` : ""}<small class="muted">Referencia: ${escapeHtml(r.id.slice(0,8))}</small></article>`).join("");
}
await loadRequests();
