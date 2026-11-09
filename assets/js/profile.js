import { supabase, requireUser, signOut } from "./supabase-client.js";
import { initAppShell, showMessage, toast } from "./ui.js";

const form = document.querySelector("#profile-form");
const msg = document.querySelector("#message");
const FIELDS = ["full_name", "company", "phone", "tax_id", "billing_address", "postal_code", "city", "country"];

document.querySelector("#logout").addEventListener("click", signOut);

const user = await requireUser();
document.querySelector("#email").value = user.email || "";

const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
initAppShell(data, user);
if (error) showMessage(msg, error.message, "error");
else for (const key of FIELDS) if (form.elements[key]) form.elements[key].value = data[key] || "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const fd = new FormData(form);
  const update = {};
  for (const key of FIELDS) {
    const value = String(fd.get(key) ?? "").trim();
    update[key] = key === "full_name" ? value : (key === "tax_id" ? value.toUpperCase() : value) || null;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  button.disabled = false;
  if (error) {
    const hint = /column|schema cache/i.test(error.message) ? " (¿Has ejecutado supabase/02_presupuestos_pagos.sql?)" : "";
    return showMessage(msg, error.message + hint, "error");
  }
  showMessage(msg, "", "");
  toast("Perfil actualizado correctamente");
  document.querySelectorAll("[data-user-name]").forEach(el => (el.textContent = update.full_name));
});
