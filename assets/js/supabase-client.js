import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
export { showMessage, escapeHtml } from "./ui.js";

if (SUPABASE_URL.includes("TU-PROYECTO") || SUPABASE_ANON_KEY.includes("PEGA_AQUI")) {
  console.warn("Configura assets/js/config.js con las credenciales públicas de Supabase.");
}
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Páginas a las que se puede volver tras iniciar sesión (evita redirecciones abiertas).
const SAFE_NEXT = ["dashboard.html", "admin.html", "profile.html", "solicitud.html", "pago.html"];
export function safeNext(value) {
  if (!value) return "dashboard.html";
  const [page, query = ""] = String(value).split("?");
  if (!SAFE_NEXT.includes(page)) return "dashboard.html";
  return query && /^[\w=&%.-]+$/.test(query) ? `${page}?${query}` : page;
}

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const here = (location.pathname.split("/").pop() || "dashboard.html") + location.search;
    location.href = `login.html?next=${encodeURIComponent(here)}`;
    throw new Error("Inicia sesión para continuar.");
  }
  return data.user;
}

export async function getProfile(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = "index.html";
}
