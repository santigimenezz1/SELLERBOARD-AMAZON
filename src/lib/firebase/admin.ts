import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { limpiarEnv } from "@/lib/env";

const projectId = limpiarEnv(process.env.FIREBASE_ADMIN_PROJECT_ID);
const clientEmail = limpiarEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
// .env files store the key with literal "\n" sequences.
const privateKey = limpiarEnv(process.env.FIREBASE_ADMIN_PRIVATE_KEY)?.replace(/\n/g, "\n");

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
