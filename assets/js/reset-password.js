import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#reset-form");
const msg = document.querySelector("#message");
const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showMessage(msg, "Enllaç validat. Ja pots desar una contrasenya nova.", "success");
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  if (fd.get("password") !== fd.get("confirm")) return showMessage(msg, "Les contrasenyes no coincideixen.", "error");
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Desant la contrasenya…", "info");
  const { error } = await supabase.auth.updateUser({ password: fd.get("password") });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  showMessage(msg, "Contrasenya actualitzada. Ja pots iniciar la sessió.", "success");
  setTimeout(() => location.href = "login.html", 1400);
});
window.addEventListener("pagehide", () => subscription.unsubscribe());
