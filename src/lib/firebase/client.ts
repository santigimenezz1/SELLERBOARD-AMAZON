"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { limpiarEnv } from "@/lib/env";

// Next.js inlines NEXT_PUBLIC_* at build time only when accessed literally,
// so each variable is read explicitly here. The browser only needs Auth:
// every Firestore read/write goes through the server (Admin SDK).
const firebaseConfig = {
  apiKey: limpiarEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: limpiarEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: limpiarEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  appId: limpiarEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | undefined;

/** Lazily initialised so a missing .env.local never crashes the build. */
export function firebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase no está configurado: revisa las variables NEXT_PUBLIC_FIREBASE_* en .env.local");
  }
  app ??= getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export const clientAuth = (): Auth => getAuth(firebaseApp());
