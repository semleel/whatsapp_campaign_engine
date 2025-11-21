"use client";

const TOKEN_STORAGE_KEY = "auth_token";
const PROFILE_STORAGE_KEY = "auth_profile";
// Default to backend on 3000; override with NEXT_PUBLIC_API_BASE_URL when front/back are split
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export type StoredAdmin = {
  id: number;
  name?: string | null;
  email: string;
  role?: string | null;
};

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  document.cookie = `${TOKEN_STORAGE_KEY}=${encodeURIComponent(
    token
  )}; path=/; SameSite=Lax`;
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  document.cookie = `${TOKEN_STORAGE_KEY}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function storeProfile(admin: StoredAdmin | null | undefined) {
  if (typeof window === "undefined") return;
  if (!admin) {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.dispatchEvent(new Event("auth-changed"));
    return;
  }
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(admin));
  window.dispatchEvent(new Event("auth-changed"));
}

export function getStoredAdmin(): StoredAdmin | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAdmin;
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  clearStoredToken();
  storeProfile(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-changed"));
  }
}

export async function requestLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const errMsg = detail?.error || "Login failed, please check your credentials.";
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (data?.token) storeToken(data.token);
  if (data?.admin) storeProfile(data.admin);
  return data;
}

export async function requestLogout() {
  const token = getStoredToken();
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Ignore network/HTTP errors during logout
  } finally {
    clearStoredSession();
  }
}
