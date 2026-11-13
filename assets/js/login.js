import { supabase, showMessage, safeNext } from "./supabase-client.js";

const form = document.querySelector("#login-form");
const msg = document.querySelector("#message");
const next = safeNext(new URLSearchParams(location.search).get("next"));

// Conserva el destino si el usuario decide registrarse.
const registerLink = document.querySelector("#register-link");
if (registerLink && next !== "dashboard.html") registerLink.href = `register.html?next=${encodeURIComponent(next)}`;

const { data: { session } } = await supabase.auth.getSession();
if (session) location.replace(next);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  showMessage(msg, "Comprovant l'accés…", "info");
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email")).trim(),
    password: fd.get("password")
  });
  button.disabled = false;
  if (error) {
    const text = error.message === "Invalid login credentials"
      ? "Correu o contrasenya incorrectes."
      : error.message === "Email not confirmed"
        ? "Confirma el teu correu electrònic abans d'iniciar la sessió."
        : error.message;
    return showMessage(msg, text, "error");
  }
  location.href = next;
});
