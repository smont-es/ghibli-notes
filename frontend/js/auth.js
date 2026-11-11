
// Authentication state
let accessToken = null;
let idToken = null;

// Generate a random string for OAuth state and PKCE
function generateRandomString(length = 64) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues)
    .map((value) => characters[value % characters.length])
    .join("");
}

// Convert a string to Base64 URL format
function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Generate the SHA-256 PKCE challenge
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  const digest = await crypto.subtle.digest("SHA-256", data);

  return base64UrlEncode(digest);
}

// Start Cognito sign-in
async function signIn() {
  if (!APP_CONFIG.cognito.domain || !APP_CONFIG.cognito.clientId) {
    throw new Error(
      "Cognito is not configured yet. Please configure the Cognito domain and client ID."
    );
  }
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);

  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state", state);

  const authorizationUrl = new URL(
    `${APP_CONFIG.cognito.domain}/oauth2/authorize`
  );

  authorizationUrl.searchParams.set("client_id", APP_CONFIG.cognito.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", APP_CONFIG.cognito.scopes.join(" "));
  authorizationUrl.searchParams.set("redirect_uri", APP_CONFIG.cognito.redirectUri);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("state", state);

  window.location.assign(authorizationUrl.toString());
}

// Exchange authorization code for tokens
async function handleAuthCallback() {
  const url = new URL(window.location.href);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  // No OAuth callback parameters means there is nothing to process.
  if (!code && !oauthError) return;

  const expectedState = sessionStorage.getItem("oauth_state");
  const verifier = sessionStorage.getItem("pkce_verifier");

  // Validate state before processing either success or error responses.
  if (
    !expectedState ||
    !returnedState ||
    returnedState !== expectedState
  ) {
    clearSession();
    throw new Error("Invalid authentication state. Please sign in again.");
  }

  // Handle errors returned by Cognito.
  if (oauthError) {
    clearSession();

    throw new Error(
      oauthErrorDescription || oauthError
    );
  }

  if (!verifier) {
    clearSession();
    throw new Error("PKCE verifier is missing. Please sign in again.");
  }

  try {
    const tokenUrl = `${APP_CONFIG.cognito.domain}/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: APP_CONFIG.cognito.clientId,
        code,
        redirect_uri: APP_CONFIG.cognito.redirectUri,
        code_verifier: verifier
      })
    });

    if (!response.ok) {
      throw new Error("Cognito rejected the authorization code.");
    }

    const tokens = await response.json();

    if (
      !tokens.access_token ||
      !tokens.id_token ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    ) {
      throw new Error("Cognito returned an invalid token response.");
    }

    accessToken = tokens.access_token;
    idToken = tokens.id_token;

    sessionStorage.setItem("access_token", accessToken);
    sessionStorage.setItem("id_token", idToken);

    sessionStorage.setItem(
      "token_expires_at",
      String(Date.now() + tokens.expires_in * 1000)
    );

    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("oauth_state");

    // Remove OAuth parameters from the address bar.
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );

  } catch (error) {
    clearSession();
    throw error;
  }
}

// Restore the current session
function restoreSession() {
  const expiresAt = Number(sessionStorage.getItem("token_expires_at"));

  if (!expiresAt || Date.now() >= expiresAt) {
    clearSession();
    return false;
  }

  accessToken = sessionStorage.getItem("access_token");
  idToken = sessionStorage.getItem("id_token");

  return Boolean(accessToken);
}

// Clear local authentication state
function clearSession() {
  accessToken = null;
  idToken = null;

  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("id_token");
  sessionStorage.removeItem("token_expires_at");
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");
}

// Start Cognito sign-out
function signOut() {
  // Always clear the local session first.
  clearSession();

  // If Cognito isn't configured, remain signed out locally.
  if (
    !APP_CONFIG.cognito.domain ||
    !APP_CONFIG.cognito.clientId ||
    !APP_CONFIG.cognito.logoutUri
  ) {
    window.location.reload();
    return;
  }

  const logoutUrl = new URL(
    `${APP_CONFIG.cognito.domain}/logout`
  );

  logoutUrl.searchParams.set(
    "client_id",
    APP_CONFIG.cognito.clientId
  );

  logoutUrl.searchParams.set(
    "logout_uri",
    APP_CONFIG.cognito.logoutUri
  );

  window.location.assign(logoutUrl.toString());
}

// Return the access token for API requests
function getAccessToken() {
  return accessToken;
}
