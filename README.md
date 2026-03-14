# ExileOracle

> Your AI-powered oracle for Path of Exile 2

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI chatbots access to your Path of Exile 2 game data. Connect it to Claude, ChatGPT, or any MCP-compatible client and let the AI help you evaluate items, compare gear, check prices, and optimize your build.

## Features

- **Stash Access** — Browse and search your stash tabs
- **Character Equipment** — View equipped gear on any character
- **Clipboard Items** — Ctrl+C items in-game for instant analysis
- **Item Collection & Comparison** — Collect multiple items and compare them side by side against your build
- **Build Import** — Import builds from [Mobalytics](https://mobalytics.gg/poe-2/builds) or Path of Building codes
- **Price Checking** — Look up item prices via poe2scout.com
- **Stash Snapshots** — Take snapshots and diff them to track changes over time
- **League Detection** — Auto-detect the current challenge league

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A Path of Exile 2 account

## Installation

```bash
git clone https://github.com/PartyPenguin/ExileOracle.git
cd ExileOracle
npm install
npm run build
```

## Authentication

ExileOracle supports two authentication methods:

### Option 1: POESESSID (Quick Start)

1. Log in to [pathofexile.com](https://www.pathofexile.com)
2. Open browser DevTools (F12) → Application → Cookies
3. Copy the `POESESSID` value
4. Set it via the `set_session_id` tool or environment variable:
   ```
   POE_SESSION_ID=your_session_id_here
   ```

> **Note:** Session IDs expire when you log out or after some time. You'll need to grab a new one periodically.

### Option 2: OAuth 2.1 (Recommended for Long-Term Use)

1. Register your application with GGG by emailing `oauth@grindinggear.com`
2. Use the `start_oauth` tool to begin the PKCE authorization flow
3. Complete the login in your browser
4. Tokens are saved and refreshed automatically

## Configuration

Configuration is stored in `~/.poe-tool/config.json` and can also be set via environment variables:

| Environment Variable | Description |
|---|---|
| `POE_SESSION_ID` | Your POESESSID cookie |
| `POE_LEAGUE` | League name (e.g. `Dawn of the Hunt`) |
| `POE_ACCOUNT` | Account name with discriminator (e.g. `player#1234`) |

You can also configure these at runtime using the `set_league`, `set_session_id`, and `set_account_name` tools.

## Connecting to an MCP Client

### Claude Desktop

Add this to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": ["C:/path/to/ExileOracle/dist/index.js"],
      "env": {
        "POE_SESSION_ID": "your_session_id_here",
        "POE_ACCOUNT": "yourname#1234"
      }
    }
  }
}
```

### Claude Code (CLI)

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": ["C:/path/to/ExileOracle/dist/index.js"]
    }
  }
}
```

## Available Tools

### Configuration
| Tool | Description |
|---|---|
| `get_config` | View current configuration |
| `set_league` | Set the active league |
| `set_session_id` | Set POESESSID for authentication |
| `set_account_name` | Set your account name (include discriminator) |
| `start_oauth` | Begin OAuth 2.1 login flow |

### Stash
| Tool | Description |
|---|---|
| `list_stash_tabs` | List all stash tabs |
| `get_stash_items` | Get items from a specific stash tab |
| `search_stash_items` | Search stash by item name, base type, or mods |

### Characters
| Tool | Description |
|---|---|
| `list_characters` | List all characters on the account |
| `get_character_equipment` | View a character's equipped items |

### Clipboard & Comparison
| Tool | Description |
|---|---|
| `get_clipboard_item` | Read an item from clipboard (Ctrl+C in-game) |
| `collect_item` | Add the current clipboard item to a collection |
| `compare_collected_items` | Compare all collected items side by side (with build context if imported) |
| `clear_collected_items` | Clear the item collection |

### Builds
| Tool | Description |
|---|---|
| `import_build` | Import a build from a Mobalytics URL or Path of Building code |
| `decode_pob_xml` | Decode a PoB code and return the raw XML |
| `get_build_equipment` | View equipment from the last imported build |

### Pricing
| Tool | Description |
|---|---|
| `price_check` | Look up the price of an item |
| `price_check_stash` | Price check all items in a stash tab |
| `list_prices` | Browse price data by category |

### Snapshots
| Tool | Description |
|---|---|
| `snapshot_stash` | Save a snapshot of your stash |
| `list_snapshots` | List all saved snapshots |
| `diff_stash` | Compare two snapshots to see what changed |

### League
| Tool | Description |
|---|---|
| `auto_detect_league` | Detect and set the current challenge league |
| `list_leagues` | List available leagues |

## Example Workflows

### Evaluate an Item
1. Hover over an item in POE2 and press **Ctrl+C**
2. Ask the chatbot: *"Is this item good for my build?"*

### Compare Multiple Items
1. Import your build: *"Import this build: [mobalytics URL]"*
2. Ctrl+C the first item → *"Collect this item"*
3. Ctrl+C the second item → *"Collect this item"*
4. *"Compare the collected items"*

### Find Upgrades in Your Stash
1. Import your build
2. *"Search my stash for rings and tell me which one is best for my build"*

### Track Stash Value
1. *"Snapshot my stash"*
2. Play for a while...
3. *"Snapshot again and show me what changed"*

## Development

```bash
npm run dev    # Watch mode (auto-recompile on changes)
npm run build  # One-time build
npm start      # Run the server
```

## License

MIT
