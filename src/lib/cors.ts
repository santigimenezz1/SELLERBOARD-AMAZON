import { NextResponse } from "next/server";

/*
 * CORS for the routes the review-recorder browser extension calls from Amazon's pages. Any origin may call them:
 * they carry no cookies and only answer with the extension's key (Authorization: Bearer), so the key, not the
 * origin, is what protects them.
 */
export const CABECERAS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** The browser's preflight check. */
export const respuestaPrevia = () => new NextResponse(null, { status: 204, headers: CABECERAS_CORS });

/** A JSON answer the extension can read from Amazon's pages. */
export const jsonCors = (cuerpo: unknown, init?: { status?: number }) => NextResponse.json(cuerpo, { status: init?.status, headers: CABECERAS_CORS });
