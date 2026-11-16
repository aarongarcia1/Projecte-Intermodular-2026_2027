// Altercom21 · Passarel·la de pagament Redsys (Supabase Edge Function "redsys")
//
//   POST /functions/v1/redsys/pay     (usuari amb sessió) → paràmetres signats per anar al TPV de Redsys
//   POST /functions/v1/redsys/notify  (servidor de Redsys) → notificació signada: marca el pagament com a pagat
//
// La clau secreta del comerç només viu aquí (variables d'entorn), mai a la web.
// Sense configurar res, funciona amb el COMERÇ DE PROVES PÚBLIC de Redsys (no es cobren diners reals).
// Per cobrar de veritat cal un contracte de TPV virtual amb un banc i definir els secrets:
//   REDSYS_ENV=live  REDSYS_MERCHANT_CODE=<FUC>  REDSYS_TERMINAL=<terminal>  REDSYS_SECRET_KEY=<clau SHA-256>
// Opcional: SITE_URL (URL pública de la web, per a les pàgines de retorn).
//
// IMPORTANT: desactiva "Enforce JWT verification" en aquesta funció (Redsys no envia cap JWT);
// la ruta /pay comprova ella mateixa la sessió de l'usuari.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import CryptoJS from "npm:crypto-js@4.2.0";

// Comerç de proves publicat per Redsys a la seva documentació (no serveix per cobrar).
const TEST_MERCHANT = { code: "999008881", terminal: "1", key: "sq7HjrUOBfKmC576ILgskD5srU870gJ7" };

const ENV = (Deno.env.get("REDSYS_ENV") ?? "test").toLowerCase();
const LIVE = ENV === "live";
const MERCHANT_CODE = Deno.env.get("REDSYS_MERCHANT_CODE") ?? (LIVE ? "" : TEST_MERCHANT.code);
const TERMINAL = Deno.env.get("REDSYS_TERMINAL") ?? (LIVE ? "" : TEST_MERCHANT.terminal);
const SECRET_KEY = Deno.env.get("REDSYS_SECRET_KEY") ?? (LIVE ? "" : TEST_MERCHANT.key);
const GATEWAY = LIVE
  ? "https://sis.redsys.es/sis/realizarPago"
  : "https://sis-t.redsys.es:25443/sis/realizarPago";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://aarongarcia1.github.io/Projecte-Intermodular-2026_2027/")
  .replace(/\/?$/, "/");

// Orígens que poden cridar /pay des del navegador (la web publicada i el servidor local de proves).
const ALLOWED_ORIGINS = [
  new URL(SITE_URL).origin,
  "http://localhost:8765",
  "http://127.0.0.1:8765"
];

// ------------------------------------------------------------------ signatura Redsys (HMAC_SHA256_V1)
// 1) Es deriva una clau per a cada comanda xifrant el número de comanda amb 3DES-CBC (IV de zeros)
//    i la clau del comerç. 2) Es fa HMAC-SHA256 dels paràmetres en Base64 amb la clau derivada.
export function encodeParams(params: Record<string, string>): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(params)));
}

export function decodeParams(b64: string): Record<string, string> {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(normal)));
}

export function sign(merchantParams: string, order: string, secretKey = SECRET_KEY): string {
  const key = CryptoJS.enc.Base64.parse(secretKey);
  const derived = CryptoJS.TripleDES.encrypt(CryptoJS.enc.Utf8.parse(order), key, {
    iv: CryptoJS.enc.Hex.parse("0000000000000000"),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding
  }).ciphertext;
  return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(merchantParams, derived));
}

const urlSafe = (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function sameSignature(a: string, b: string): boolean {
  const x = urlSafe(a), y = urlSafe(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// Número de comanda: 4 dígits + 8 alfanumèrics (format exigit per Redsys, únic per comerç).
export function newOrder(): string {
  const digits = String(Math.floor(Date.now() / 1000) % 10000).padStart(4, "0");
  const chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return digits + Array.from(rnd, b => chars[b % chars.length]).join("");
}

// ------------------------------------------------------------------ utilitats HTTP
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
      }
    : {};
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) }
  });
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false }
  });
}

// ------------------------------------------------------------------ /pay
async function handlePay(req: Request): Promise<Response> {
  if (!MERCHANT_CODE || !TERMINAL || !SECRET_KEY) {
    return json(req, 500, { error: "La passarel·la Redsys no està configurada." });
  }
  const authorization = req.headers.get("authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(req, 401, { error: "Inicia la sessió per pagar." });

  let paymentId = "";
  try { paymentId = String((await req.json()).payment_id ?? ""); } catch { /* cos buit */ }
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return json(req, 400, { error: "Pagament no vàlid." });

  const admin = adminClient();
  const { data: payment, error } = await admin
    .from("payments")
    .select("id, request_id, user_id, reference, method, status, total")
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return json(req, 500, { error: error.message });
  if (!payment) return json(req, 404, { error: "No s'ha trobat el pagament." });
  if (payment.method !== "redsys") return json(req, 400, { error: "Aquest pagament no és amb targeta (Redsys)." });
  if (payment.status !== "pending") return json(req, 409, { error: "Aquest pagament ja no està pendent." });

  // Cada intent fa servir un número de comanda nou (Redsys no deixa repetir-lo).
  const order = newOrder();
  const { error: updError } = await admin
    .from("payments")
    .update({ redsys_order: order, redsys_response: null })
    .eq("id", payment.id)
    .eq("status", "pending");
  if (updError) return json(req, 500, { error: updError.message });

  const origin = req.headers.get("origin") ?? "";
  const base = ALLOWED_ORIGINS.includes(origin) && origin !== new URL(SITE_URL).origin ? origin + "/" : SITE_URL;
  const back = (result: string) => `${base}pago.html?id=${payment.request_id}&redsys=${result}`;

  const params: Record<string, string> = {
    DS_MERCHANT_AMOUNT: String(Math.round(Number(payment.total) * 100)),
    DS_MERCHANT_ORDER: order,
    DS_MERCHANT_MERCHANTCODE: MERCHANT_CODE,
    DS_MERCHANT_CURRENCY: "978",            // EUR
    DS_MERCHANT_TRANSACTIONTYPE: "0",       // autorització
    DS_MERCHANT_TERMINAL: TERMINAL,
    DS_MERCHANT_MERCHANTURL: `${Deno.env.get("SUPABASE_URL")}/functions/v1/redsys/notify`,
    DS_MERCHANT_URLOK: back("ok"),
    DS_MERCHANT_URLKO: back("ko"),
    DS_MERCHANT_MERCHANTNAME: "Altercom21",
    DS_MERCHANT_PRODUCTDESCRIPTION: `Altercom21 - ${payment.reference}`,
    DS_MERCHANT_CONSUMERLANGUAGE: "003"     // català
  };
  const merchantParams = encodeParams(params);
  return json(req, 200, {
    url: GATEWAY,
    test: !LIVE,
    Ds_SignatureVersion: "HMAC_SHA256_V1",
    Ds_MerchantParameters: merchantParams,
    Ds_Signature: sign(merchantParams, order)
  });
}

// ------------------------------------------------------------------ /notify
async function handleNotify(req: Request): Promise<Response> {
  const form = await req.formData();
  const merchantParams = String(form.get("Ds_MerchantParameters") ?? "");
  const signature = String(form.get("Ds_Signature") ?? "");
  if (!merchantParams || !signature) return new Response("Bad request", { status: 400 });

  let p: Record<string, string>;
  try { p = decodeParams(merchantParams); } catch { return new Response("Bad request", { status: 400 }); }
  const order = String(p.Ds_Order ?? "");
  if (!order || !sameSignature(sign(merchantParams, order), signature)) {
    console.warn("Redsys: signatura no vàlida per a la comanda", order);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = adminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("id, status, total")
    .eq("redsys_order", order)
    .maybeSingle();
  if (!payment) {
    console.warn("Redsys: comanda desconeguda", order);
    return new Response("OK");
  }

  const code = parseInt(String(p.Ds_Response ?? "9999"), 10);
  const amountOk = Number(p.Ds_Amount) === Math.round(Number(payment.total) * 100) && String(p.Ds_Currency) === "978";
  const approved = code >= 0 && code <= 99 && amountOk;

  const update: Record<string, unknown> = {
    redsys_response: String(p.Ds_Response ?? ""),
    redsys_auth_code: p.Ds_AuthorisationCode ? String(p.Ds_AuthorisationCode).trim() : null,
    redsys_notified_at: new Date().toISOString()
  };
  if (approved) update.status = "paid";
  else if (payment.status === "pending") update.status = "failed";
  if (!amountOk) update.admin_notes = "Redsys: l'import notificat no coincideix amb el del pagament.";

  // Només es toquen pagaments encara oberts (una notificació repetida no fa res).
  await admin.from("payments").update(update).eq("id", payment.id).in("status", ["pending", "under_review"]);
  return new Response("OK");
}

// ------------------------------------------------------------------ servidor
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith("/pay")) return await handlePay(req);
    if (path.endsWith("/notify")) return await handleNotify(req);
    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("Redsys:", e);
    return json(req, 500, { error: "Error intern de la passarel·la." });
  }
}

if (!Deno.env.get("REDSYS_NO_SERVE")) Deno.serve(handler);
