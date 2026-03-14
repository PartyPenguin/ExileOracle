import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  league: string;
  sessionId: string | null;
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  oauthExpiresAt: number | null;
  accountName: string | null;
  realm: string;
}

const CONFIG_DIR = join(homedir(), ".poe-tool");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const defaults: Config = {
  league: "Fate of the Vaal",
  sessionId: null,
  oauthAccessToken: null,
  oauthRefreshToken: null,
  oauthExpiresAt: null,
  accountName: null,
  realm: "poe2",
};

let current: Config = { ...defaults };

export async function loadConfig(): Promise<Config> {
  // Load from env first
  if (process.env.POE_SESSION_ID) {
    current.sessionId = process.env.POE_SESSION_ID;
  }
  if (process.env.POE_LEAGUE) {
    current.league = process.env.POE_LEAGUE;
  }
  if (process.env.POE_ACCOUNT) {
    current.accountName = process.env.POE_ACCOUNT;
  }

  // Then overlay from file
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    const saved = JSON.parse(data) as Partial<Config>;
    current = { ...current, ...saved };
  } catch {
    // No config file yet, that's fine
  }

  return current;
}

export async function saveConfig(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(current, null, 2));
}

export function getConfig(): Config {
  return current;
}

export function updateConfig(updates: Partial<Config>): Config {
  Object.assign(current, updates);
  return current;
}
