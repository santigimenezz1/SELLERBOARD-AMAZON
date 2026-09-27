import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { limpiarEnv } from "@/lib/env";

/**
 * Rebuilds the service-account private key as a proper PEM, whatever shape the
 * environment delivered it in: literal "\n" sequences (Railway, raw .env
 * values), real newlines (Next.js already expands them from .env.local),
 * spaces, CRLF or leftover quotes. Only the base64 body between the markers is
 * kept, and it's re-wrapped at 64 characters.
 */
export function normalizarClavePrivada(valor: string | undefined): string | undefined {
  const limpia = limpiarEnv(valor);
  if (!limpia) return undefined;
  const conSaltos = limpia.replace(/\\+r/g, "").replace(/\\+n/g, "\n").replace(/\r/g, "");
  const m = conSaltos.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!m) return conSaltos;
  const cuerpo = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  return `-----BEGIN ${m[1]}-----\n${cuerpo.match(/.{1,64}/g)!.join("\n")}\n-----END ${m[1]}-----\n`;
}

const projectId = limpiarEnv(process.env.FIREBASE_ADMIN_PROJECT_ID);
const clientEmail = limpiarEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
const privateKey = normalizarClavePrivada(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

export const isAdminConfigured = Boolean(projectId && clientEmail && privateKey);

function adminApp(): App {
  if (!isAdminConfigured) {
    throw new Error("Firebase Admin no está configurado: revisa las variables FIREBASE_ADMIN_* en .env.local");
  }
  if (getApps().length) return getApp();
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
