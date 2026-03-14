import { getConfig } from "../config.js";

const OAUTH_BASE = "https://api.pathofexile.com";
const SESSION_BASE = "https://www.pathofexile.com";
const USER_AGENT = "PoeTool/1.0 (poe2-mcp-server)";

interface RateLimitState {
  remaining: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitState>();

async function waitForRateLimit(endpoint: string): Promise<void> {
  const state = rateLimits.get(endpoint);
  if (state && state.remaining <= 0) {
    const waitMs = state.resetAt - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function updateRateLimit(endpoint: string, headers: Headers): void {
  const limit = headers.get("x-rate-limit-ip");
  const state = headers.get("x-rate-limit-ip-state");

  if (limit && state) {
    const [maxHits, periodSec] = limit.split(",")[0]?.split(":").map(Number) ?? [10, 10];
    const [currentHits] = state.split(",")[0]?.split(":").map(Number) ?? [0];
    rateLimits.set(endpoint, {
      remaining: maxHits - currentHits,
      resetAt: Date.now() + periodSec * 1000,
    });
  }
}

/** Fetch from api.pathofexile.com (OAuth) */
export async function poeApiFetch(
  path: string,
  options?: { method?: string; body?: string }
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const config = getConfig();

  const endpointKey = path.split("/").slice(0, 3).join("/");
  await waitForRateLimit(endpointKey);

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  if (config.oauthAccessToken) {
    headers["Authorization"] = `Bearer ${config.oauthAccessToken}`;
  } else if (config.sessionId) {
    headers["Cookie"] = `POESESSID=${config.sessionId}`;
  }

  const url = `${OAUTH_BASE}${path}`;
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body,
  });

  updateRateLimit(endpointKey, response.headers);

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const waitSec = retryAfter ? parseInt(retryAfter, 10) : 10;
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
    return poeApiFetch(path, options);
  }

  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

/** Fetch from www.pathofexile.com (POESESSID session auth) */
export async function poeSessionFetch(
  path: string,
  params?: Record<string, string>
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const config = getConfig();

  const endpointKey = path;
  await waitForRateLimit(endpointKey);

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  if (config.sessionId) {
    headers["Cookie"] = `POESESSID=${config.sessionId}`;
  }

  const url = new URL(`${SESSION_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), { headers });

  updateRateLimit(endpointKey, response.headers);

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const waitSec = retryAfter ? parseInt(retryAfter, 10) : 10;
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
    return poeSessionFetch(path, params);
  }

  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

/** Returns true if we have OAuth tokens, false if using session */
export function isOAuth(): boolean {
  return !!getConfig().oauthAccessToken;
}
