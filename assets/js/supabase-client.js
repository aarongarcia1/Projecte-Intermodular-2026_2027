import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (SUPABASE_URL.includes("TU-PROYECTO") || SUPABASE_ANON_KEY.includes("PEGA_AQUI")) {
  console.warn("Configura assets/js/config.js con las credenciales públicas de Supabase.");
}
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const next = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
    location.href = `login.html?next=${next}`;
    throw new Error("Inicia sesión para continuar.");
  }
  return data.user;
}
export async function signOut() {
  await supabase.auth.signOut();
  location.href = "index.html";
}
export function showMessage(el, message, kind = "") {
  if (!el) return;
  el.textContent = message;
  el.className = `message ${kind}`.trim();
}
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[ch]);
}
