/**
 * useAuth — client-side authentication hook.
 *
 * Tries the real FastAPI backend first.  When the backend is unreachable
 * (which is the normal case for the standalone demo) it falls back to a
 * fully offline, localStorage-based mock auth system so every page of the
 * app is usable without Docker / the backend running.
 */
import { useState, useCallback } from 'react';
import { authApi, type User } from '../lib/api';

const TOKEN_KEY = 'focusmeet_token';
const USER_KEY = 'focusmeet_user';
const USERS_DB_KEY = 'focusmeet_users_db'; // mock user database

/* ── Tiny offline user database stored in localStorage ───── */
interface StoredUser {
  id: string;
  email: string;
  username: string;
  password: string; // plain-text for the demo only
  is_active: boolean;
}

function getMockDb(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_DB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMockDb(db: StoredUser[]) {
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function safeBtoa(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binString = '';
  for (let i = 0; i < bytes.length; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  return btoa(binString);
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateMockToken(userId: string, email: string): string {
  // Looks like a JWT but is just base-64 — good enough for the demo.
  const header = safeBtoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = safeBtoa(
    JSON.stringify({
      sub: userId,
      email,
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  return `${header}.${payload}.mock_signature`;
}

/* ── Hook ─────────────────────────────────────────────────── */

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAuth = useCallback((t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
    setError(null);
  }, []);

  /* ── Register ───────────────────────────────────────────── */
  const register = useCallback(
    async (email: string, username: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        // Try real backend first
        const res = await authApi.register({ email, username, password });
        saveAuth(res.access_token, res.user);
        return;
      } catch (err) {
        // Only fall through to mock if backend is unreachable (network error)
        if (!(err instanceof TypeError && err.message === 'Failed to fetch')) {
          const msg = err instanceof Error ? err.message : 'Registration failed';
          setError(msg);
          setLoading(false);
          throw new Error(msg);
        }
      }

      // ── Mock offline registration ──
      const db = getMockDb();

      if (db.some((u) => u.email === email)) {
        const msg = 'An account with this email already exists';
        setError(msg);
        setLoading(false);
        throw new Error(msg);
      }
      if (db.some((u) => u.username === username)) {
        const msg = 'This username is already taken';
        setError(msg);
        setLoading(false);
        throw new Error(msg);
      }

      const id = generateId();
      const hashedPassword = await hashPassword(password);
      const newUser: StoredUser = { id, email, username, password: hashedPassword, is_active: true };
      db.push(newUser);
      saveMockDb(db);

      const mockToken = generateMockToken(id, email);
      const userObj: User = { id, email, username, is_active: true };
      saveAuth(mockToken, userObj);
      setLoading(false);
    },
    [saveAuth],
  );

  /* ── Login ──────────────────────────────────────────────── */
  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        // Try real backend first
        const res = await authApi.login({ email, password });
        saveAuth(res.access_token, res.user);
        return;
      } catch (err) {
        // Only fall through to mock if backend is unreachable (network error)
        if (!(err instanceof TypeError && err.message === 'Failed to fetch')) {
          const msg = err instanceof Error ? err.message : 'Login failed';
          setError(msg);
          setLoading(false);
          throw new Error(msg);
        }
      }

      // ── Mock offline login ──
      const db = getMockDb();
      const found = db.find((u) => u.email === email);

      if (!found) {
        const msg = 'No account found with this email. Please sign up first.';
        setError(msg);
        setLoading(false);
        throw new Error(msg);
      }

      const hashedPassword = await hashPassword(password);
      if (found.password !== hashedPassword && found.password !== password) {
        const msg = 'Incorrect password';
        setError(msg);
        setLoading(false);
        throw new Error(msg);
      }

      const mockToken = generateMockToken(found.id, found.email);
      const userObj: User = {
        id: found.id,
        email: found.email,
        username: found.username,
        is_active: found.is_active,
      };
      saveAuth(mockToken, userObj);
      setLoading(false);
    },
    [saveAuth],
  );

  /* ── Logout ─────────────────────────────────────────────── */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const isAuthenticated = !!token && !!user;

  return { user, token, loading, error, login, register, logout, isAuthenticated };
}
