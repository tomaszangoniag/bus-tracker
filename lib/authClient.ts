/**
 * Sesión demo en cliente (localStorage).
 * Key única: "currentUser" — usada en login, register y logout.
 */

export const CURRENT_USER_KEY = "currentUser";

export type CurrentUserPayload = {
  id: string;
  email: string;
  role: string;
  savedAt: number;
};

/** Guarda usuario demo en localStorage (misma key en toda la app). */
export function persistDemoSession(user: {
  id: string;
  email: string;
  role: string;
}): void {
  if (typeof window === "undefined") return;
  const payload: CurrentUserPayload = {
    ...user,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Borra sesión demo del cliente (logout). */
export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch {
    // ignore
  }
}
