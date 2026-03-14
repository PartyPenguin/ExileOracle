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

  // Session-based: use character-window endpoint
  const config = getConfig();
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  const { status, data } = await poeSessionFetch("/character-window/get-characters", {
    accountName: config.accountName,
    realm: config.realm,
  });

  if (status !== 200) {
    throw new Error(`Failed to list characters (${status}): ${JSON.stringify(data)}`);
  }

  const characters = data as Array<Character & { league?: string }>;
  if (!Array.isArray(characters)) return [];

  // The session endpoint returns ALL characters across POE1 and POE2.
  // POE1-only classes let us filter them out.
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

  // Session-based: use character-window endpoint
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  const { status, data } = await poeSessionFetch("/character-window/get-items", {
    accountName: config.accountName,
    realm: config.realm,
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
