import Auth0 from 'react-native-auth0';
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'azul_refresh_token';

// Replace these with your Auth0 app credentials
const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? 'YOUR_AUTH0_DOMAIN';
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? 'YOUR_AUTH0_CLIENT_ID';

const auth0 = new Auth0({ domain: AUTH0_DOMAIN, clientId: AUTH0_CLIENT_ID });

export async function login() {
  const credentials = await auth0.webAuth.authorize({
    scope: 'openid profile email offline_access',
    audience: 'https://api.azul',
  });

  if (credentials.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, credentials.refreshToken);
  }

  return credentials;
}

export async function register() {
  const credentials = await auth0.webAuth.authorize({
    scope: 'openid profile email offline_access',
    audience: 'https://api.azul',
    additionalParameters: { screen_hint: 'signup' },
  });

  if (credentials.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, credentials.refreshToken);
  }

  return credentials;
}

export async function logout() {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function refreshSession() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    return await auth0.auth.refreshToken({ refreshToken });
  } catch {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    return null;
  }
}

export function parseIdToken(idToken: string): Record<string, any> {
  const payload = idToken.split('.')[1];
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(padded);
  return JSON.parse(decoded);
}
