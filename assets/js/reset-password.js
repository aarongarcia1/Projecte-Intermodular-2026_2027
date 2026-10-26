import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#reset-form");
const msg = document.querySelector("#message");
const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showMessage(msg, "Enlace validado. Ya puedes guardar una contraseña nueva.", "success");
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  if (fd.get("password") !== fd.get("confirm")) return showMessage(msg, "Las contraseñas no coinciden.", "error");
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Guardando contraseña…");
  const { error } = await supabase.auth.updateUser({ password: fd.get("password") });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  showMessage(msg, "Contraseña actualizada. Ya puedes iniciar sesión.", "success");
  setTimeout(() => location.href = "login.html", 1400);
});
window.addEventListener("pagehide", () => subscription.unsubscribe());
