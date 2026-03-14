import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { updateConfig, saveConfig, getConfig } from "../config.js";

// OAuth 2.1 with PKCE for public clients
// Users need to register at pathofexile.com/developer or email oauth@grindinggear.com

const AUTH_URL = "https://www.pathofexile.com/oauth/authorize";
const TOKEN_URL = "https://www.pathofexile.com/oauth/token";
const SCOPES = "account:profile account:stashes account:characters";

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function startOAuthFlow(clientId: string, port = 8655): Promise<string> {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");
  const redirectUri = `http://localhost:${port}/callback`;

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (returnedState !== state) {
        res.writeHead(400);
        res.end("State mismatch");
        reject(new Error("OAuth state mismatch"));
        server.close();
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end("No code received");
        reject(new Error("No authorization code received"));
        server.close();
        return;
      }

      try {
        const tokenResponse = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
          }),
        });

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        updateConfig({
          oauthAccessToken: tokens.access_token,
          oauthRefreshToken: tokens.refresh_token,
          oauthExpiresAt: Date.now() + tokens.expires_in * 1000,
        });
        await saveConfig();

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authenticated! You can close this tab.</h1>");
        resolve(tokens.access_token);
      } catch (err) {
        res.writeHead(500);
        res.end("Token exchange failed");
        reject(err);
      } finally {
        server.close();
      }
    });

    server.listen(port, () => {
      resolve(authUrl.toString());
    });

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth flow timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

export async function refreshTokens(clientId: string): Promise<void> {
  const config = getConfig();
  if (!config.oauthRefreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: config.oauthRefreshToken,
    }),
  });

  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  updateConfig({
    oauthAccessToken: tokens.access_token,
    oauthRefreshToken: tokens.refresh_token,
    oauthExpiresAt: Date.now() + tokens.expires_in * 1000,
  });
  await saveConfig();
}
