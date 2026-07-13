import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const BASE = '/magma-onboarding-tracker/';

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin + BASE,
    postLogoutRedirectUri: window.location.origin + BASE,
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
};

export const loginRequest = {
  // Sites.ReadWrite.All   — item CRUD on the onboarding lists
  // User.Read             — signed-in user's profile + photo
  // User.ReadBasic.All    — org-wide people picker (assign manager)
  // GroupMember.Read.All  — read the user's security-group membership for role (HR/Manager/New hire)
  scopes: ['Sites.ReadWrite.All', 'User.Read', 'User.ReadBasic.All', 'GroupMember.Read.All'],
};

export const msalInstance = new PublicClientApplication(msalConfig);

if (typeof window !== 'undefined') {
  window.__magma = { msalInstance, loginRequest };
}

export async function initializeMsal() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();
}

export async function login() {
  const response = await msalInstance.loginPopup(loginRequest);
  return response.account;
}

export async function logout() {
  await msalInstance.logoutRedirect({ postLogoutRedirectUri: window.location.origin + BASE });
}

export function getActiveAccount() {
  const accounts = msalInstance.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

export async function getAccessToken() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) throw new Error('No authenticated account found. Please sign in.');
  const silentRequest = { ...loginRequest, account: accounts[0] };
  try {
    const response = await msalInstance.acquireTokenSilent(silentRequest);
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const response = await msalInstance.acquireTokenPopup(loginRequest);
      return response.accessToken;
    }
    throw error;
  }
}
