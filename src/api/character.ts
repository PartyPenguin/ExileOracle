import { getConfig } from "../config.js";
import { poeApiFetch, poeSessionFetch, isOAuth } from "./client.js";
import type { StashItem } from "./stash.js";

export interface Character {
  name: string;
  class: string;
  level: number;
  league: string;
  realm?: string;
}

export interface CharacterEquipment {
  character: Character;
  items: StashItem[];
}

export async function listCharacters(): Promise<Character[]> {
  if (isOAuth()) {
    const { status, data } = await poeApiFetch("/character");
    if (status !== 200) {
      throw new Error(`Failed to list characters (${status}): ${JSON.stringify(data)}`);
    }
    const response = data as { characters: Character[] };
    return (response.characters ?? []).filter((c) => c.realm === "poe2");
  }

  // Session-based: use legacy character-window endpoint (POE1 domain)
  // Note: This only returns POE1 characters. POE2 characters require OAuth.
  // For POE2 item analysis, use clipboard (Ctrl+C) and build import instead.
  const config = getConfig();
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  const { status, data } = await poeSessionFetch("/character-window/get-characters", {
    accountName: config.accountName,
  });

  if (status !== 200) {
    throw new Error(`Failed to list characters (${status}): ${JSON.stringify(data)}`);
  }

  const characters = data as Character[];
  if (!Array.isArray(characters)) return [];

  // Filter out POE1-only classes
  const poe1OnlyClasses = new Set([
    "marauder", "duelist", "templar", "shadow", "scion",
    "juggernaut", "berserker", "chieftain",
    "slayer", "gladiator", "champion",
    "inquisitor", "hierophant", "guardian",
    "saboteur", "assassin", "trickster",
    "necromancer", "elementalist", "occultist",
    "ascendant",
  ]);

  return characters.filter((c) => !poe1OnlyClasses.has(c.class?.toLowerCase()));
}

export async function getCharacterEquipment(characterName: string): Promise<CharacterEquipment> {
  const config = getConfig();

  if (isOAuth()) {
    const { status, data } = await poeApiFetch(
      `/character/${config.realm}/${encodeURIComponent(characterName)}`
    );
    if (status !== 200) {
      throw new Error(`Failed to get character (${status}): ${JSON.stringify(data)}`);
    }
    const response = data as {
      character: Character;
      equipment: StashItem[];
      items?: StashItem[];
    };
    return {
      character: response.character,
      items: response.equipment ?? response.items ?? [],
    };
  }

  // Session-based: use legacy character-window endpoint
  // Note: Only works for POE1 characters. POE2 equipment requires OAuth.
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  const { status, data } = await poeSessionFetch("/character-window/get-items", {
    accountName: config.accountName,
    character: characterName,
  });

  if (status !== 200) {
    throw new Error(`Failed to get character equipment (${status}): ${JSON.stringify(data)}`);
  }

  const response = data as { character: Character; items: StashItem[] };
  return {
    character: response.character ?? { name: characterName, class: "Unknown", level: 0, league: config.league },
    items: response.items ?? [],
  };
}
