/*
 * Which of Amazon's emails are performance notifications, and which country
 * each belongs to. Worked out from this account's mailbox against Seller
 * Central's «Notificaciones de performance» page for amazon.es:
 *
 * - Amazon sends each notification in the language of the store it's about
 *   (the EU tax-registration notice arrives in Spanish, German, French,
 *   Italian, Dutch, Polish, Swedish and English), and amazon.es lists the
 *   Spanish ones, including those about another store ("…en Amazon.fr").
 * - The same senders also send refunds, payouts, invoices, shipment updates
 *   and support-case replies, which Seller Central doesn't list: only subjects
 *   of the notification kinds below count.
 */

/** Gmail search that narrows the mailbox to candidates; `esNotificacion` then decides exactly. */
export const CONSULTA_GMAIL = [
  // Seller Central's list covers two years.
  "from:amazon newer_than:2y",
  "-subject:(RE OR Rückerstattung OR Reembolso OR Remboursement OR Rimborso OR Refund)",
  "subject:(fiscales OR VAT OR IVA OR TVA OR btw OR moms OR Umsatzsteuer OR Umsatzsteuerregistrierung OR podatnik OR desactivación OR desactivada OR deactivation OR Deaktivierung OR désactivation OR disattivazione OR deactivering OR dezaktywacji OR KYC OR verificación OR verificada OR verification OR Verifizierung OR tarjeta OR Kreditkarte OR carte OR GPSR OR Produktsicherheit OR listings OR Policy OR política OR Revisión OR Prórroga OR documentos OR Llamadme OR Llamarme OR Consulta OR operativa OR riesgo OR pagos OR vendedor OR requerida)",
].join(" ");

// Notification kinds, in any of the store languages seen.
const TIPOS: RegExp[] = [
  /registro a efectos fiscales|VAT registration|Umsatzsteuerregistrierung|Umsatzsteuer|immatriculation à la TVA|registrazione IVA|btw-registratie|podatnik VAT|momsregistrering/i,
  // Deactivation risk. The invoice-defect «Advertencia de suspensión…» and «Se suspende la elegibilidad…» emails
  // aren't listed by Seller Central, so suspension wording alone doesn't count.
  /desactivaci[oó]n|desactivad[ao]|deactivat|Deaktivierung|d[eé]sactivation|disattivazione|deactivering|dezaktywacji/i,
  /Conoce a tu cliente|\bKYC\b|verificaci[oó]n de la cuenta|account verification|Kontoverifizierung|informaci[oó]n est[aá] verificada/i,
  // («Es necesario actualizar la tarjeta…» isn't listed either; «Se requiere la actualización…» is.)
  /cuenta de pagos|Se requiere la actualizaci[oó]n de la tarjeta|credit card update|Kreditkarte|carte de cr[eé]dit|carta di credito/i,
  /direcci[oó]n operativa/i,
  /GPSR|Produktsicherheit|s[eé]curit[eé] g[eé]n[eé]rale des produits|sicurezza generale dei prodotti/i,
  /listings de vendedor de Amazon est[aá]n desactivados|Reactiva tus listings/i,
  /Policy Warning|advertencia de pol[ií]tica|Richtlinienwarnung/i,
  /Revisi[oó]n de su cuenta de vendedor|Su cuenta de vendedor de Amazon\./i,
  /Pr[oó]rroga pendiente|Solicitud de documentos/i,
  /Llamadme ahora|Llamarme ahora|Su Consulta en Amazon/i,
];
// Replies, refunds, payouts, invoices and shipping news are never performance notifications.
// (Invoice notices are matched by their wording, not the bare word: «facturas defectuosas» is a notification.)
const EXCLUIDOS =
  /^(re|aw|fw|fwd)\s*:|\[CASE|reembolso|refund|r[uü]ckerstattung|rembourse|rimborso|\b(Factura|Fattura|Facture|Factuur) (Log[ií]stica|Vendedor|Venditore|Vendeur|Verkoper|Fulfilled)|Rechnung(skorrektur)? (Versand|Verk[aä]ufer)|Merchant Invoice|Nota de Cr[eé]dito|pago est[aá] en camino|payment is on the way|Auszahlung|paiement est en cours|saldo deudor|Pago del saldo/i;

/** Seller Central performance notification (by subject; sender must be Amazon). */
export function esNotificacion(asunto: string, remitente: string): boolean {
  if (!/@([a-z0-9-]+\.)*amazon\.[a-z.]+>?\s*$/i.test(remitente.trim())) return false;
  if (EXCLUIDOS.test(asunto)) return false;
  return TIPOS.some((t) => t.test(asunto));
}

type Idioma = "es" | "de" | "fr" | "it" | "nl" | "pl" | "sv" | "en";

// Distinctive words per language (checked most distinctive first); Spanish is the default.
const PALABRAS: [Idioma, RegExp][] = [
  ["pl", /[ąęłśżźćń]|\b(twoje|podatnik|spełnia|dotyczące|dni)\b/i],
  ["sv", /\b(ditt|uppfyller|inom|dagar|lager|beläggs|momsregistrering\w*)\b/i],
  ["de", /[äöüß]|\b(Ihr|Ihre|Sie|Ihren|und|der|die|das|des|zu|um|für|wurde|erforderlich|Angebote|Konto|Kontos|vermeiden|ausgleichen)\b/],
  ["nl", /\b(je|jouw|het|een|voor|vermeldingen|naleving|voldoet|staan|onderdrukt|Activeer|Verstrek|binnen|dagen|vereist)\b/i],
  ["it", /\b(il tuo|tuo|tua|ora|offerte|Riattivare|conforme ai|Fornisci|entro|giorni|Unione)\b/i],
  ["fr", /\b(votre|vos|désormais|exigences|mise à jour|Réactivation|conformité|requise|compte est|Fournissez|jours|informations|éviter|délai)\b/i],
  ["es", /\b(tu|tus|su|sus|cuenta|para|los|las|del|requiere|Proporciona|Actualiza|Toma medidas|Mensaje|Revisión|consulta)\b/i],
  ["en", /\b(your|the|is now|required|account|update|notice|warning|to avoid)\b/i],
];

export function idiomaDe(asunto: string): Idioma {
  return PALABRAS.find(([, re]) => re.test(asunto))?.[0] ?? "es";
}

const MERCADO_POR_IDIOMA: Record<Idioma, string> = {
  es: "A1RKKUPIHCS9HS",
  de: "A1PA6795UKMFR9",
  fr: "A13V1IB3VIYZZH",
  it: "APJ6JRA9NG5V4",
  nl: "A1805IZSGTT6HS",
  pl: "A1C3SOZRARQ6R3",
  sv: "A2NODRKZP88ZB9",
  en: "A1F83G8C2ARO7P",
};
const MERCADO_POR_TIENDA: Record<string, string> = {
  "amazon.es": "A1RKKUPIHCS9HS",
  "amazon.de": "A1PA6795UKMFR9",
  "amazon.fr": "A13V1IB3VIYZZH",
  "amazon.it": "APJ6JRA9NG5V4",
  "amazon.nl": "A1805IZSGTT6HS",
  "amazon.com.be": "AMEN7PMS3EDWL",
  "amazon.pl": "A1C3SOZRARQ6R3",
  "amazon.se": "A2NODRKZP88ZB9",
  "amazon.co.uk": "A1F83G8C2ARO7P",
};

/**
 * Countries whose «Notificaciones de performance» list this one: the store of its language, plus, for the
 * Spanish ones (the seller's language), any store the subject names ("…en Amazon.fr"), as Seller Central does;
 * the same notice in other languages stays in its own store. English ones sent from a store's own domain
 * (e.g. «Notice: Policy Warning» from amazon.es) belong to that store; other English ones to the UK.
 */
export function mercadosDe(asunto: string, remitente = ""): string[] {
  const idioma = idiomaDe(asunto);
  const dominio = remitente.match(/@(?:[a-z0-9-]+\.)*?(amazon\.[a-z.]+?)>?\s*$/i)?.[1]?.toLowerCase();
  const tiendaRemitente = dominio && dominio !== "amazon.com" ? MERCADO_POR_TIENDA[dominio] : undefined;
  const res = new Set([idioma === "en" && tiendaRemitente ? tiendaRemitente : MERCADO_POR_IDIOMA[idioma]]);
  if (idioma === "es") for (const [tienda, id] of Object.entries(MERCADO_POR_TIENDA)) if (new RegExp(`\\b${tienda.replace(/\./g, "\\.")}\\b`, "i").test(asunto)) res.add(id);
  return [...res];
}
