import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#forgot-form");
const msg = document.querySelector("#message");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = new FormData(form).get("email").trim();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Enviando enlace…");
  const redirectTo = new URL("reset-password.html", location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  showMessage(msg, "Si existe una cuenta para ese correo, recibirás un enlace para restablecer la contraseña.", "success");
});
