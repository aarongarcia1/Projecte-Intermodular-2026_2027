import { supabase, showMessage } from "./supabase-client.js";
const form = document.querySelector("#login-form");
const msg = document.querySelector("#message");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true; showMessage(msg, "Comprobando acceso…");
  const { error } = await supabase.auth.signInWithPassword({
    email: fd.get("email").trim(), password: fd.get("password")
  });
  button.disabled = false;
  if (error) return showMessage(msg, error.message, "error");
  const requested = new URLSearchParams(location.search).get("next");
  location.href = requested === "admin.html" ? "admin.html" : "dashboard.html";
});
