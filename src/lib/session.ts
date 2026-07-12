import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Token lives in the OS secure keystore (Keychain/Keystore), not plain storage. The rider/customer
// stays signed in until they explicitly log out. We never trust the token's contents for authz —
// the server re-verifies its signature on every request.
// expo-secure-store has no web implementation, so the web build (debugging only) falls back to
// localStorage.
const KEY = 'rf_token';
const isWeb = Platform.OS === 'web';

export async function getToken(): Promise<string> {
  if (isWeb) return globalThis.localStorage?.getItem(KEY) ?? '';
  return (await SecureStore.getItemAsync(KEY)) ?? '';
}
export async function setToken(token: string): Promise<void> {
  if (isWeb) { globalThis.localStorage?.setItem(KEY, token); return; }
  await SecureStore.setItemAsync(KEY, token);
}
export async function clearToken(): Promise<void> {
  if (isWeb) { globalThis.localStorage?.removeItem(KEY); return; }
  await SecureStore.deleteItemAsync(KEY);
}

/** Decode a claim from the access token's public payload (base64url(JSON).signature). */
function claim<T = string>(token: string, name: string): T | undefined {
  const body = token.split('.')[0];
  if (!body) return undefined;
  try {
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    // Minimal base64 decode (no atob dependency).
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bytes = '';
    for (let i = 0; i < pad.length; i += 4) {
      const n = (chars.indexOf(pad[i]) << 18) | (chars.indexOf(pad[i + 1]) << 12) |
        ((chars.indexOf(pad[i + 2]) & 63) << 6) | (chars.indexOf(pad[i + 3]) & 63);
      bytes += String.fromCharCode((n >> 16) & 255);
      if (pad[i + 2] !== '=') bytes += String.fromCharCode((n >> 8) & 255);
      if (pad[i + 3] !== '=') bytes += String.fromCharCode(n & 255);
    }
    const json = JSON.parse(decodeURIComponent(escape(bytes))) as Record<string, unknown>;
    return json[name] as T | undefined;
  } catch {
    return undefined;
  }
}

export type Role = 'CUSTOMER' | 'RIDER' | 'ADMIN';
export function getRole(token: string): Role { return (claim<Role>(token, 'role')) ?? 'CUSTOMER'; }
export function getUserId(token: string): string { return claim<string>(token, 'sub') ?? ''; }
