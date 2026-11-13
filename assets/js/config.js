// Solo introduce aquí la URL y la clave PÚBLICA (anon/publishable) de Supabase.
// Nunca pongas una service_role/secret key en el navegador.
export const SUPABASE_URL = "https://czqrkbndwfyogwyubhyb.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_lFzF1SkMGBlk1eZk6d72XQ_wnC0ICRn";

// Datos de la empresa que se muestran en la web y en las instrucciones de pago.
export const COMPANY = {
  name: "Altercom21",
  email: "contacto@altercom21.com"
};

// Métodos de pago. Rellena estos datos con los reales antes de publicar.
// - Si un método no está configurado, se muestra como "no disponible".
// - Nunca se piden ni se guardan datos de tarjeta en esta web: el pago con
//   tarjeta se hace en una pasarela externa (p. ej. un Stripe Payment Link).
export const PAYMENT_CONFIG = {
  vatRate: 21, // IVA (%). Debe coincidir con el valor de supabase/02_presupuestos_pagos.sql
  transfer: {
    // CUENTA DE PRUEBA (proyecto de clase): sustituir por los datos reales antes de cobrar.
    beneficiary: "Altercom21 (compte de prova)",
    iban: "ES00 0000 0000 0000 0000 0000",
    bic: "",
    bank: "Entorn de proves · no facis transferències reals"
  },
  bizum: {
    phone: "" // ← p. ej. "600 000 000"; vacío = método desactivado
  },
  card: {
    paymentUrl: "" // ← URL de pago seguro (Stripe Payment Link, Redsys…); vacío = desactivado
  }
};
