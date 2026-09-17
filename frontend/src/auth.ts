import { useSyncExternalStore } from 'react';

export type User = { id: string; email: string };
type Session = { accessToken: string; expiresAt: string; user: User };
type AuthState = { user: User | null; loading: boolean; error: string | null };
let session: Session | null = null;
let state: AuthState = { user: null, loading: true, error: null };
const listeners = new Set<() => void>();
let refreshPromise: Promise<boolean> | null = null;
let bootPromise: Promise<void> | null = null;

function publish(next: AuthState) { state = next; listeners.forEach((listener) => listener()); }
function accept(next: Session | null) {
  session = next;
  publish({ user: next?.user ?? null, loading: false, error: null });
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useAuth() { return useSyncExternalStore(subscribe, () => state); }

async function post(path: string, data?: unknown) {
  return fetch(`/api/auth/${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Profefacilisimo' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function message(response: Response) {
  if (response.status === 429) return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  if (response.status === 401) return 'Correo o contraseña incorrectos, o cuenta temporalmente bloqueada.';
  try {
    const problem = await response.json();
    if (problem.errors) return Object.values(problem.errors).flat().join(' ');
  } catch { /* HTTP response may not contain JSON. */ }
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}
export async function register(email: string, password: string) {
  const response = await post('register', { email, password });
  if (!response.ok) throw new Error(await message(response));
}
export async function login(email: string, password: string) {
  const response = await post('login', { email, password });
  if (!response.ok) throw new Error(await message(response));
  accept(await response.json());
}
export function refresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await post('refresh');
      if (response.status === 401) { accept(null); return false; }
      if (!response.ok) throw new Error(await message(response));
      accept(await response.json());
      return true;
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
export function initializeAuth() {
  if (!bootPromise) bootPromise = refresh().then(() => {}).catch(() => {
    publish({ user: null, loading: false, error: 'No pudimos conectar con el servidor. Comprueba la API y vuelve a intentar.' });
  });
  return bootPromise;
}
export async function retryInitialization() {
  bootPromise = null;
  publish({ user: null, loading: true, error: null });
  await initializeAuth();
}
export async function logout() {
  if (refreshPromise) await refreshPromise;
  const response = await post('logout');
  if (!response.ok) throw new Error(await message(response));
  accept(null);
}
export async function getCurrentUser(): Promise<User> {
  const request = () => fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } });
  let response = await request();
  if (response.status === 401 && await refresh()) response = await request();
  if (!response.ok) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.');
  return response.json();
}
