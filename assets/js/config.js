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
  // Passarel·la de pagament amb targeta (TPV virtual Redsys). La signatura la fa la Edge Function
  // supabase/functions/redsys; aquí només hi ha l'adreça. testMode: true = entorn de proves de Redsys
  // (no es cobren diners reals). Posa endpoint: "" per desactivar-la.
  redsys: {
    endpoint: `${SUPABASE_URL}/functions/v1/redsys`,
    testMode: true
  },
  vatRate: 21, // IVA (%). Debe coincidir con el valor de supabase/02_presupuestos_pagos.sql
  transfer: {
    // CUENTA DE PRUEBA (proyecto de clase): sustituir por los datos reales antes de cobrar.
    beneficiary: "Altercom21 (compte de prova)",
    iban: "ES00 0000 0000 0000 0000 0000",
    bic: "",
    bank: "Entorn de proves · no facis transferències reals"
  },
  bizum: {
    phone: "" // vacío = método desactivado (Bizum mostraría el teléfono personal)
  },
  card: {
    // Enllaç públic de Revolut: el client paga amb targeta o Revolut i només veu el perfil de Revolut,
    // no el telèfon ni l'IBAN. També admet un Stripe Payment Link. Buit = desactivat.
    paymentUrl: "https://revolut.me/agarciabayo07"
  }
};
