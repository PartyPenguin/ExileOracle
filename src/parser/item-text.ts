export interface ParsedItem {
  rarity: string;
  name: string;
  typeLine: string;
  itemLevel?: number;
  quality?: number;
  corrupted: boolean;
  mirrored: boolean;
  unidentified: boolean;
  implicitMods: string[];
  explicitMods: string[];
  craftedMods: string[];
  properties: Array<{ name: string; value: string }>;
  requirements: Array<{ name: string; value: string }>;
  sockets?: string;
  rawText: string;
}

const SEPARATOR = "--------";

export function isPoeItemText(text: string): boolean {
  return (
    text.includes("Rarity:") &&
    text.includes(SEPARATOR) &&
    (text.includes("Item Level:") ||
      text.includes("Level:") ||
      text.includes("Rarity: Currency") ||
      text.includes("Rarity: Gem"))
  );
}

export function parseItemText(text: string): ParsedItem {
  const lines = text.trim().split(/\r?\n/);
  const sections: string[][] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    if (line.trim() === SEPARATOR) {
      if (currentSection.length > 0) {
        sections.push(currentSection);
        currentSection = [];
      }
    } else {
      currentSection.push(line);
    }
  }
  if (currentSection.length > 0) {
    sections.push(currentSection);
  }

  const item: ParsedItem = {
    rarity: "",
    name: "",
    typeLine: "",
    corrupted: false,
    mirrored: false,
    unidentified: false,
    implicitMods: [],
    explicitMods: [],
    craftedMods: [],
    properties: [],
    requirements: [],
    rawText: text,
  };

  if (sections.length === 0) return item;

  // First section: Rarity, name, type
  const header = sections[0];
  for (const line of header) {
    if (line.startsWith("Rarity: ")) {
      item.rarity = line.replace("Rarity: ", "").trim();
    }
  }

  const headerLines = header.filter((l) => !l.startsWith("Rarity:"));
  if (headerLines.length >= 2) {
    item.name = headerLines[0];
    item.typeLine = headerLines[1];
  } else if (headerLines.length === 1) {
    item.typeLine = headerLines[0];
    item.name = headerLines[0];
  }

  // Process remaining sections
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    // Check for single-line markers
    if (section.length === 1) {
      const line = section[0].trim();
      if (line === "Corrupted") {
        item.corrupted = true;
        continue;
      }
      if (line === "Mirrored") {
        item.mirrored = true;
        continue;
      }
      if (line === "Unidentified") {
        item.unidentified = true;
        continue;
      }
    }

    // Check for Item Level
    const itemLevelLine = section.find((l) => l.startsWith("Item Level:"));
    if (itemLevelLine) {
      item.itemLevel = parseInt(itemLevelLine.replace("Item Level:", "").trim(), 10);
      continue;
    }

    // Check for Quality
    const qualityLine = section.find((l) => l.startsWith("Quality:"));
    if (qualityLine) {
      const match = qualityLine.match(/\+(\d+)%/);
      if (match) item.quality = parseInt(match[1], 10);
    }

    // Check for Sockets
    const socketLine = section.find((l) => l.startsWith("Sockets:"));
    if (socketLine) {
      item.sockets = socketLine.replace("Sockets:", "").trim();
      continue;
    }

    // Check for Requirements
    if (section[0]?.startsWith("Requirements:")) {
      for (let j = 1; j < section.length; j++) {
        const match = section[j].match(/^\s*(.+?):\s*(.+)$/);
        if (match) {
          item.requirements.push({ name: match[1].trim(), value: match[2].trim() });
        }
      }
      continue;
    }

    // Check for properties (weapon damage, APS, etc.)
    if (
      section.some(
        (l) =>
          l.includes("Physical Damage:") ||
          l.includes("Attacks per Second:") ||
          l.includes("Armour:") ||
          l.includes("Evasion Rating:") ||
          l.includes("Energy Shield:")
      )
    ) {
      for (const line of section) {
        const match = line.match(/^(.+?):\s*(.+)$/);
        if (match) {
          item.properties.push({ name: match[1].trim(), value: match[2].trim() });
        }
      }
      continue;
    }

    // Check for implicit mods (section with "(implicit)" suffix)
    if (section.some((l) => l.includes("(implicit)"))) {
      for (const line of section) {
        item.implicitMods.push(line.replace("(implicit)", "").trim());
      }
      continue;
    }

    // Check for crafted mods (section with "(crafted)" suffix)
    if (section.some((l) => l.includes("(crafted)"))) {
      for (const line of section) {
        if (line.includes("(crafted)")) {
          item.craftedMods.push(line.replace("(crafted)", "").trim());
        } else {
          item.explicitMods.push(line.trim());
        }
      }
      continue;
    }

    // Remaining sections with mod-like lines are explicit mods
    const looksLikeMods = section.every(
      (l) =>
        /^[+-]?\d/.test(l.trim()) ||
        l.trim().startsWith("Adds ") ||
        l.trim().startsWith("Grants ") ||
        /^\d+%/.test(l.trim()) ||
        /increased|reduced|more|less|to |with /i.test(l)
    );

    if (looksLikeMods && section.length > 0) {
      for (const line of section) {
        item.explicitMods.push(line.trim());
      }
    }
  }

  return item;
}
