import { inflateSync } from "node:zlib";

export interface PoBBuild {
  class: string;
  ascendancy: string;
  level: number;
  mainSkill: string | null;
  skills: PoBSkill[];
  items: PoBItem[];
  treeNodes: number[];
  notes: string;
  rawXml: string;
}

export interface PoBSkill {
  label: string;
  enabled: boolean;
  gems: Array<{
    name: string;
    level: number;
    quality: number;
    enabled: boolean;
  }>;
}

export interface PoBItem {
  slot: string;
  rarity: string;
  name: string;
  basetype: string;
  mods: string[];
  rawText: string;
}

/**
 * Decode a Path of Building export code into XML
 */
export function decodePoBCode(code: string): string {
  // Strip whitespace and URL prefixes
  let cleaned = code.trim();
  if (cleaned.startsWith("https://pobb.in/")) {
    throw new Error(
      "pobb.in URLs cannot be decoded directly. Please paste the raw PoB code instead (from Path of Building: Export > Share)."
    );
  }

  // Reverse URL-safe base64 substitution
  cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
  const padLen = (4 - (cleaned.length % 4)) % 4;
  cleaned += "=".repeat(padLen);

  // Base64 decode
  const compressed = Buffer.from(cleaned, "base64");

  // zlib inflate
  const xml = inflateSync(compressed).toString("utf-8");
  return xml;
}

/**
 * Parse PoB XML into a structured build object
 */
export function parsePoBXml(xml: string): PoBBuild {
  const build: PoBBuild = {
    class: "",
    ascendancy: "",
    level: 1,
    mainSkill: null,
    skills: [],
    items: [],
    treeNodes: [],
    notes: "",
    rawXml: xml,
  };

  // Parse <Build> attributes
  const buildMatch = xml.match(/<Build\s([^>]+)>/);
  if (buildMatch) {
    const attrs = buildMatch[1];
    build.level = parseInt(extractAttr(attrs, "level") ?? "1", 10);
    build.class = extractAttr(attrs, "className") ?? "";
    build.ascendancy = extractAttr(attrs, "ascendClassName") ?? "";
    build.mainSkill = extractAttr(attrs, "mainSocketGroup") ?? null;
  }

  // Parse <Skill> elements
  const skillRegex = /<Skill\s([^>]*)>([\s\S]*?)<\/Skill>/g;
  let skillMatch;
  while ((skillMatch = skillRegex.exec(xml)) !== null) {
    const attrs = skillMatch[1];
    const body = skillMatch[2];
    const skill: PoBSkill = {
      label: extractAttr(attrs, "label") ?? "",
      enabled: extractAttr(attrs, "enabled") !== "false",
      gems: [],
    };

    const gemRegex = /<Gem\s([^>]*)\/?>/g;
    let gemMatch;
    while ((gemMatch = gemRegex.exec(body)) !== null) {
      const gemAttrs = gemMatch[1];
      skill.gems.push({
        name: extractAttr(gemAttrs, "nameSpec") ?? extractAttr(gemAttrs, "skillId") ?? "Unknown",
        level: parseInt(extractAttr(gemAttrs, "level") ?? "1", 10),
        quality: parseInt(extractAttr(gemAttrs, "quality") ?? "0", 10),
        enabled: extractAttr(gemAttrs, "enabled") !== "false",
      });
    }

    if (skill.gems.length > 0) {
      build.skills.push(skill);
    }
  }

  // Parse <Item> elements
  const itemRegex = /<Item\s+id="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemText = itemMatch[2].trim();
    const lines = itemText.split(/\r?\n/);

    const item: PoBItem = {
      slot: "",
      rarity: "",
      name: "",
      basetype: "",
      mods: [],
      rawText: itemText,
    };

    for (const line of lines) {
      if (line.startsWith("Rarity: ")) {
        item.rarity = line.replace("Rarity: ", "");
      } else if (!item.name && item.rarity && line.trim() && !line.startsWith("--")) {
        if (!item.name) item.name = line.trim();
        else if (!item.basetype) item.basetype = line.trim();
      }
    }

    build.items.push(item);
  }

  // Parse item slot assignments
  const slotRegex = /<Slot\s+name="([^"]+)"\s+itemId="(\d+)"/g;
  let slotMatch;
  while ((slotMatch = slotRegex.exec(xml)) !== null) {
    const slotName = slotMatch[1];
    const itemId = parseInt(slotMatch[2], 10) - 1;
    if (build.items[itemId]) {
      build.items[itemId].slot = slotName;
    }
  }

  // Parse tree nodes
  const specMatch = xml.match(/<Spec[^>]*>[\s\S]*?<URL>([\s\S]*?)<\/URL>/);
  if (specMatch) {
    const treeUrl = specMatch[1].trim();
    const nodeMatch = treeUrl.match(/[?&]nodes=([^&]+)/);
    if (nodeMatch) {
      build.treeNodes = nodeMatch[1].split(",").map(Number).filter(Boolean);
    }
  }

  // Parse notes
  const notesMatch = xml.match(/<Notes>([\s\S]*?)<\/Notes>/);
  if (notesMatch) {
    build.notes = notesMatch[1].trim();
  }

  return build;
}

function extractAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * Decode and parse a PoB code in one step
 */
export function importPoBCode(code: string): PoBBuild {
  const xml = decodePoBCode(code);
  return parsePoBXml(xml);
}

/**
 * Format a build summary for display
 */
export function formatBuildSummary(build: PoBBuild): string {
  const lines: string[] = [];

  lines.push(`Class: ${build.class}${build.ascendancy ? ` (${build.ascendancy})` : ""}`);
  lines.push(`Level: ${build.level}`);

  if (build.skills.length > 0) {
    lines.push("\nSkill Groups:");
    for (const skill of build.skills.filter((s) => s.enabled)) {
      const label = skill.label || skill.gems[0]?.name || "Unnamed";
      const gems = skill.gems
        .filter((g) => g.enabled)
        .map((g) => `${g.name} (Lv${g.level}${g.quality ? ` Q${g.quality}` : ""})`)
        .join(", ");
      lines.push(`  ${label}: ${gems}`);
    }
  }

  const equippedItems = build.items.filter((i) => i.slot);
  if (equippedItems.length > 0) {
    lines.push("\nEquipment:");
    for (const item of equippedItems) {
      lines.push(`  ${item.slot}: ${item.name || item.basetype} (${item.rarity})`);
    }
  }

  if (build.notes) {
    lines.push(`\nNotes: ${build.notes.slice(0, 200)}`);
  }

  return lines.join("\n");
}
