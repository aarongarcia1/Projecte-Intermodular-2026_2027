import { supabase, showMessage, safeNext } from "./supabase-client.js";

const form = document.querySelector("#register-form");
const msg = document.querySelector("#message");
const next = safeNext(new URLSearchParams(location.search).get("next"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  showMessage(msg, "Creant el compte…", "info");
  const { data, error } = await supabase.auth.signUp({
    email: String(fd.get("email")).trim(),
    password: fd.get("password"),
    options: {
      data: {
        full_name: String(fd.get("full_name")).trim(),
        company: String(fd.get("company")).trim(),
        phone: String(fd.get("phone")).trim()
      },
      emailRedirectTo: new URL(next, location.href).href
    }
  });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  if (data.session) location.href = next;
  else {
    form.reset();
    showMessage(msg, "Compte creat. Revisa el correu per confirmar l'adreça i després inicia la sessió.", "success");
  }
});
