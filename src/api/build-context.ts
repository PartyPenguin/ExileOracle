/**
 * Shared normalized build context that works with both Mobalytics and PoB imports.
 * Allows comparison tools to access the last imported build regardless of source.
 */

export interface BuildEquipSlot {
  slot: string;
  name: string;
  isUnique: boolean;
  mods: string[];
  runes?: string[];
}

export interface BuildSkillInfo {
  name: string;
  supports: string[];
  weaponSet?: string;
}

export interface BuildContext {
  source: "mobalytics" | "pob";
  name: string;
  class: string;
  ascendancy: string;
  variant?: string;
  equipment: BuildEquipSlot[];
  skills: BuildSkillInfo[];
  tags: string[];
}

let currentBuild: BuildContext | null = null;

export function setBuildContext(build: BuildContext): void {
  currentBuild = build;
}

export function getBuildContext(): BuildContext | null {
  return currentBuild;
}

/**
 * Slot name normalization — maps various naming conventions to canonical slot names
 */
const SLOT_ALIASES: Record<string, string> = {
  // Mobalytics names
  "helmet": "Helmet",
  "body": "Body Armour",
  "gloves": "Gloves",
  "boots": "Boots",
  "belt": "Belt",
  "amulet": "Amulet",
  "leftring": "Ring 1",
  "rightring": "Ring 2",
  "extraring": "Ring 3",
  "mainhand (set 1)": "Weapon 1",
  "offhand (set 1)": "Weapon 2",
  "mainhand (set 2)": "Weapon Swap 1",
  "offhand (set 2)": "Weapon Swap 2",
  "flask1": "Flask 1",
  "flask2": "Flask 2",
  "charm1": "Charm 1",
  "charm2": "Charm 2",
  "charm3": "Charm 3",

  // PoB names
  "weapon 1": "Weapon 1",
  "weapon 2": "Weapon 2",
  "weapon 1 swap": "Weapon Swap 1",
  "weapon 2 swap": "Weapon Swap 2",
  "ring 1": "Ring 1",
  "ring 2": "Ring 2",
  "body armour": "Body Armour",
  "flask 1": "Flask 1",
  "flask 2": "Flask 2",
  "flask 3": "Flask 3",
  "flask 4": "Flask 4",
  "flask 5": "Flask 5",
};

export function normalizeSlotName(slot: string): string {
  return SLOT_ALIASES[slot.toLowerCase()] ?? slot;
}

/**
 * Maps item base types to equipment slot categories for stash searching
 */
const SLOT_TO_ITEM_CLASSES: Record<string, string[]> = {
  "Helmet": ["helmet", "helm", "cap", "crown", "mask", "hood", "coif", "circlet", "cage", "burgonet", "bascinet", "visage", "tricorne"],
  "Body Armour": ["body armour", "plate", "vest", "robe", "garb", "coat", "jacket", "vestment", "regalia", "brigandine", "chestplate", "tunic"],
  "Gloves": ["gloves", "gauntlets", "mitts", "wraps", "bracers"],
  "Boots": ["boots", "greaves", "slippers", "shoes", "sabatons"],
  "Belt": ["belt", "sash", "stygian"],
  "Amulet": ["amulet", "pendant", "talisman", "choker", "charm", "locket"],
  "Ring": ["ring", "circle", "band", "loop"],
  "Weapon": ["sword", "axe", "mace", "sceptre", "staff", "bow", "wand", "dagger", "claw", "flail", "quarterstaff", "crossbow", "spear"],
  "Shield": ["shield", "buckler", "spirit shield", "kite shield", "tower shield"],
  "Flask": ["flask"],
};

/**
 * Get item class keywords for a given slot category
 */
export function getSlotItemClasses(slotCategory: string): string[] {
  // Try exact match
  const classes = SLOT_TO_ITEM_CLASSES[slotCategory];
  if (classes) return classes;

  // Try partial match
  for (const [key, val] of Object.entries(SLOT_TO_ITEM_CLASSES)) {
    if (key.toLowerCase().includes(slotCategory.toLowerCase()) ||
        slotCategory.toLowerCase().includes(key.toLowerCase())) {
      return val;
    }
  }

  return [];
}

export function formatBuildContext(build: BuildContext, slotFilter?: string): string {
  const lines: string[] = [];

  lines.push(`Build: ${build.name} (${build.source})`);
  lines.push(`Class: ${build.class}${build.ascendancy ? ` (${build.ascendancy})` : ""}`);
  if (build.variant) lines.push(`Variant: ${build.variant}`);
  if (build.tags.length > 0) lines.push(`Tags: ${build.tags.join(", ")}`);

  // Filter equipment by slot if requested
  let equipment = build.equipment;
  if (slotFilter) {
    const filter = slotFilter.toLowerCase();
    equipment = equipment.filter(e => {
      const slotLower = e.slot.toLowerCase();
      return slotLower.includes(filter) || filter.includes(slotLower);
    });
  }

  if (equipment.length > 0) {
    lines.push("\nEquipment:");
    for (const item of equipment) {
      const unique = item.isUnique ? " [Unique]" : "";
      lines.push(`  ${item.slot}: ${item.name}${unique}`);
      for (const mod of item.mods) {
        lines.push(`    - ${mod}`);
      }
      if (item.runes && item.runes.length > 0) {
        lines.push(`    Runes: ${item.runes.join(", ")}`);
      }
    }
  } else if (slotFilter) {
    lines.push(`\nNo equipment found for slot filter: "${slotFilter}"`);
  }

  if (!slotFilter) {
    // Show skills summary when not filtering by slot
    if (build.skills.length > 0) {
      lines.push("\nSkills:");
      for (const skill of build.skills) {
        const supports = skill.supports.length > 0 ? ` + ${skill.supports.join(", ")}` : "";
        lines.push(`  ${skill.name}${supports}`);
      }
    }
  }

  return lines.join("\n");
}
