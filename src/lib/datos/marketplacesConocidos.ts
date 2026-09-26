import { nombrePais } from "./paises";
import type { Marketplace } from "./tipos";

/**
 * Amazon's marketplace ids (they never change). Used when the Sellers API
 * isn't available to the app: the markets are then worked out from the
 * orders themselves.
 */
const CONOCIDOS: Record<string, { codigoPais: string; dominio: string; moneda: string }> = {
  A1RKKUPIHCS9HS: { codigoPais: "ES", dominio: "www.amazon.es", moneda: "EUR" },
  A1PA6795UKMFR9: { codigoPais: "DE", dominio: "www.amazon.de", moneda: "EUR" },
  A13V1IB3VIYZZH: { codigoPais: "FR", dominio: "www.amazon.fr", moneda: "EUR" },
  APJ6JRA9NG5V4: { codigoPais: "IT", dominio: "www.amazon.it", moneda: "EUR" },
  A1805IZSGTT6HS: { codigoPais: "NL", dominio: "www.amazon.nl", moneda: "EUR" },
  AMEN7PMS3EDWL: { codigoPais: "BE", dominio: "www.amazon.com.be", moneda: "EUR" },
  A28R8C7NBKEWEA: { codigoPais: "IE", dominio: "www.amazon.ie", moneda: "EUR" },
  A1F83G8C2ARO7P: { codigoPais: "GB", dominio: "www.amazon.co.uk", moneda: "GBP" },
  A2NODRKZP88ZB9: { codigoPais: "SE", dominio: "www.amazon.se", moneda: "SEK" },
  A1C3SOZRARQ6R3: { codigoPais: "PL", dominio: "www.amazon.pl", moneda: "PLN" },
  A33AVAJ2PDY3EV: { codigoPais: "TR", dominio: "www.amazon.com.tr", moneda: "TRY" },
  ARBP9OOSHTCHU: { codigoPais: "EG", dominio: "www.amazon.eg", moneda: "EGP" },
  A17E79C6D8DWNP: { codigoPais: "SA", dominio: "www.amazon.sa", moneda: "SAR" },
  A2VIGQ35RCS4UG: { codigoPais: "AE", dominio: "www.amazon.ae", moneda: "AED" },
  A21TJRUUN4KGV: { codigoPais: "IN", dominio: "www.amazon.in", moneda: "INR" },
};

export function marketplaceConocido(id: string): Marketplace | null {
  const m = CONOCIDOS[id];
  return m ? { id, ...m, pais: nombrePais(m.codigoPais) } : null;
}
