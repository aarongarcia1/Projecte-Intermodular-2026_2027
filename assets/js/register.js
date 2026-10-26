import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#register-form");
const msg = document.querySelector("#message");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Creando cuenta…");
  const { data, error } = await supabase.auth.signUp({
    email: fd.get("email").trim(),
    password: fd.get("password"),
    options: { data: {
      full_name: fd.get("full_name").trim(),
      company: fd.get("company").trim(),
      phone: fd.get("phone").trim()
    }, emailRedirectTo: new URL("dashboard.html", location.href).href }
  });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  if (data.session) location.href = "dashboard.html";
  else showMessage(msg, "Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.", "success");
});
