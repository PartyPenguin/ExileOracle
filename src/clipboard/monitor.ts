import clipboardy from "clipboardy";
import { isPoeItemText, parseItemText, type ParsedItem } from "../parser/item-text.js";

let lastClipboard = "";
let lastParsedItem: ParsedItem | null = null;

export function getLastClipboardItem(): ParsedItem | null {
  return lastParsedItem;
}

export async function checkClipboard(): Promise<ParsedItem | null> {
  try {
    const text = await clipboardy.read();
    if (text && text !== lastClipboard) {
      lastClipboard = text;
      if (isPoeItemText(text)) {
        lastParsedItem = parseItemText(text);
        return lastParsedItem;
      }
    }
  } catch {
    // Clipboard access failed, ignore
  }
  return null;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startClipboardPolling(intervalMs = 500): void {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    checkClipboard();
  }, intervalMs);
}

export function stopClipboardPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
