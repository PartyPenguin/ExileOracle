import { getConfig } from "../config.js";

const LEAGUES_URL = "https://api.pathofexile.com/league";
const USER_AGENT = "PoeTool/1.0 (poe2-mcp-server)";

export interface League {
  id: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  event?: boolean;
  realm?: string;
  rules?: Array<{ id: string; name: string; description: string }>;
}

let leagueCache: { leagues: League[]; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function listLeagues(realm = "poe2"): Promise<League[]> {
  if (leagueCache && Date.now() - leagueCache.fetchedAt < CACHE_TTL) {
    return leagueCache.leagues;
  }

  const config = getConfig();
  const url = `${LEAGUES_URL}?type=main&realm=${encodeURIComponent(realm)}&compact=1`;

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };

  // The leagues API requires auth
  if (config.oauthAccessToken) {
    headers["Authorization"] = `Bearer ${config.oauthAccessToken}`;
  } else if (config.sessionId) {
    headers["Cookie"] = `POESESSID=${config.sessionId}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Leagues API error (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { leagues: League[] } | League[];
  const leagues = Array.isArray(body) ? body : body.leagues ?? [];
  leagueCache = { leagues, fetchedAt: Date.now() };
  return leagues;
}

export async function getCurrentChallengeLeague(realm = "poe2"): Promise<League | null> {
  const leagues = await listLeagues(realm);

  // Find a non-permanent challenge league (has an endAt date in the future)
  const now = new Date().toISOString();
  const challenge = leagues.find(
    (l) =>
      l.id !== "Standard" &&
      l.id !== "Hardcore" &&
      l.id !== "Solo Self-Found" &&
      l.id !== "Hardcore SSF" &&
      !l.id.startsWith("HC ") &&
      !l.id.startsWith("SSF ") &&
      !l.id.startsWith("HC SSF ") &&
      l.endAt &&
      l.endAt > now
  );

  // If no active challenge league with endAt, find the most recent non-standard league
  if (!challenge) {
    const nonStandard = leagues.find(
      (l) =>
        l.id !== "Standard" &&
        l.id !== "Hardcore" &&
        l.id !== "Solo Self-Found" &&
        l.id !== "Hardcore SSF" &&
        !l.id.startsWith("HC ") &&
        !l.id.startsWith("SSF ") &&
        !l.id.startsWith("HC SSF ")
    );
    return nonStandard ?? null;
  }

  return challenge;
}
