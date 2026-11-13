import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#forgot-form");
const msg = document.querySelector("#message");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = String(new FormData(form).get("email")).trim();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Enviant l'enllaç…", "info");
  const redirectTo = new URL("reset-password.html", location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  showMessage(msg, "Si existeix un compte amb aquest correu, rebràs un enllaç per restablir la contrasenya.", "success");
});
