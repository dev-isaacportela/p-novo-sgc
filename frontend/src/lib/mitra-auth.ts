// Sessao e inicializacao do SDK do Mitra.
//
// Dois modos, decididos por VITE_MITRA_AUTH_URL no .env do frontend:
//  - com a variavel: fluxo Mitra real (login hospedado no dominio Mitra, token
//    chega no fragment `#tokenMitra=...&backURLMitra=...` — o mesmo contrato
//    que o painel do mitra-hub reproduz);
//  - sem a variavel: modo local — `loginLocally()` autentica no simulador
//    (backend/simulator) e o SDK aponta para ele.
// Nenhuma alteracao de codigo e necessaria para alternar.

import { configureSdkMitra } from 'mitra-interactions-sdk';

const STORE_KEY = 'mitra-session';
const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID || '1');
// Porta do simulador deste projeto (backend/simulator/config.mjs).
export const SIMULADOR_URL: string = import.meta.env.VITE_MITRA_BASE_URL || 'http://localhost:3109';
export const MODO_LOCAL = !import.meta.env.VITE_MITRA_AUTH_URL;
const AUTH_URL = import.meta.env.VITE_MITRA_AUTH_URL || SIMULADOR_URL;

interface MitraSession {
  baseURL: string;
  token: string;
  integrationURL?: string;
}

// ── Store ──

function loadSession(): MitraSession | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.baseURL && parsed?.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function hasSession(): boolean {
  return loadSession() !== null;
}

export function getSession(): MitraSession | null {
  return loadSession();
}

function normalizeSession(session: Record<string, unknown> | null | undefined): MitraSession | null {
  if (!session) return null;
  const baseURL = String(session.baseURL || SIMULADOR_URL);
  const rawToken = String(session.token || session.accessToken || '');
  if (!rawToken) return null;
  return {
    baseURL,
    token: rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`,
    ...(session.integrationURL ? { integrationURL: String(session.integrationURL) } : {}),
  };
}

export function saveSession(session: Record<string, unknown>): void {
  const normalized = normalizeSession(session);
  if (!normalized) return;
  localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
  configureSdk(normalized);
}

export function clearSession(): void {
  localStorage.removeItem(STORE_KEY);
}

function configureSdk(session: MitraSession): void {
  configureSdkMitra({
    ...session,
    projectId: PROJECT_ID,
    authUrl: AUTH_URL,
    onTokenRefresh: (newSession: MitraSession) => saveSession(newSession as unknown as Record<string, unknown>),
  });
}

// ── Modo local ──

/** Login no simulador (senha unica em backend/simulator/config.mjs). */
export async function loginLocally(email: string, password: string) {
  const response = await fetch(`${SIMULADOR_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => {
    throw new Error('Simulador fora do ar. Rode: cd backend && npm run sim');
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.error?.message || 'Falha no login local.');
  }
  saveSession({ baseURL: data.baseURL || SIMULADOR_URL, token: data.token, integrationURL: data.integrationURL });
  return data;
}

// ── Init ──

/** Configura o SDK a partir do fragment (#) ou da sessao salva. Retorna se ha sessao. */
export function initMitra(): boolean {
  // Tokens vem no fragment (#) para nao vazar em logs/referrer — nunca mover para query string.
  const hash = window.location.hash?.slice(1) || '';
  const hashParams = new URLSearchParams(hash);
  const token = hashParams.get('tokenMitra');
  const backURL = hashParams.get('backURLMitra');

  function cleanHash() {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }

  // Erro retornado pelo auth — limpa URL (erro ja foi exibido no sdk-auth)
  if (token === 'error') {
    cleanHash();
    return false;
  }

  // Login via redirect com sucesso (Mitra real ou painel do mitra-hub)
  if (token && backURL) {
    const session: MitraSession = {
      baseURL: backURL,
      token: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      ...(hashParams.get('integrationURLMitra') ? { integrationURL: hashParams.get('integrationURLMitra')! } : {}),
    };
    saveSession(session as unknown as Record<string, unknown>);
    cleanHash();
    return true;
  }

  // Sessao anterior no localStorage
  const session = loadSession();
  if (session) {
    configureSdk(session);
    return true;
  }

  return false;
}
