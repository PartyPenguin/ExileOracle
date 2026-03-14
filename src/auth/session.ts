import { getConfig, updateConfig, saveConfig } from "../config.js";

export function isSessionAuthenticated(): boolean {
  return !!getConfig().sessionId;
}

export async function setSessionId(sessionId: string): Promise<void> {
  updateConfig({ sessionId });
  await saveConfig();
}

export function getAuthHeaders(): Record<string, string> {
  const config = getConfig();
  if (config.oauthAccessToken) {
    return { Authorization: `Bearer ${config.oauthAccessToken}` };
  }
  if (config.sessionId) {
    return { Cookie: `POESESSID=${config.sessionId}` };
  }
  return {};
}
