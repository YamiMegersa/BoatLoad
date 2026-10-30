import { getAssetUrl } from '../utils/paths.js';

/**
 * CreditsConfig — Editable Credit Roll Configuration & Parser
 *
 * HOW TO EDIT CREDITS:
 * You can edit the credits in ANY of these simple ways:
 *   1. Edit `CREDITS.md` (or `public/credits.md`) using plain text / Markdown lines.
 *   2. Edit `CREDITS_LIST` directly below in this file (a simple array of lines).
 *   3. Pass a custom array/list or string directly into `CreditsUI` or `transition(GamePhase.CREDITS, { credits: [...] })`.
 *
 * Supported Line Syntax:
 *   "# Title"                -> Large Gold Pirate Title
 *   "~ Subtitle ~"           -> Nautical Crimson Ribbon Subtitle
 *   "> Quote"                -> Italicized Parchment Quote
 *   "## [icon-name] Heading" -> Gold Section Header (with optional pixel-art icon class)
 *   "### Subheading"         -> Brass Role / Category Subheading
 *   "- Name"                 -> Crew / Contributor Entry
 *   "- Role : Name"          -> Two-part Label & Contributor Entry
 *   "---"                    -> Ornate Nautical Divider
 */

export const CREDITS_LIST = [
  "# BOATLOAD",
  "~ Shipwreck & Sail ~",
  "",
  "> \"Three perilous days on treacherous waters, and the old hull still floats!\"",
  "",
  "---",
  "",
  "## [icon-anchor] THE CREW — DEVELOPMENT TEAM",
  "",
  "### Core Engineering & Game Design",
  "- Christopher Giles",
  "- Zaeem Fakir",
  "- Yamlack Megersa",
  "",
  "### Voice Acting & Syllable Recordings",
  "- George, Brendan, Branden & Team : Customer Dialogue & Shouts",
  "",
  "---",
  "",
  "## [icon-helm-wheel] ORIGINAL TEAM WORK & ARCHITECTURE",
  "",
  "### Custom Shaders & Graphics (Coursework Highlights)",
  "- Procedural Underwater Caustics Shader (GLSL injection, depth extinction & chromatic dispersion)",
  "- Procedural Gerstner Ocean Wave Dynamics & Surface Deformation",
  "- Volumetric God Rays & Atmospheric Fog Volumes",
  "- Dynamic Weather Systems (Squalls, Overcast Lighting, Storm Rain & Sea Wind)",
  "",
  "### Gameplay Systems & Mechanics",
  "- Voxel Grid Hull Construction, Blueprint Snapping & Real-Time Damage System",
  "- Buoyancy Simulation & Flooding Calculations",
  "- BVH Accelerated Spatial Raycasting",
  "- Siren Allure Resistance & Reversible Steering State Machine",
  "- Shark AI Threat & Harpoon Station QTE Mechanics",
  "- Multi-Phase Kraken Boss Encounter & Tentacle Follower Sequences",
  "- Harbor Dock Village, Ghost Merchant Outfitting Stall & Economy Ledger",
  "- Custom 16-Bit Pixel-Art UI, Compass & Nautical Telemetry Gauges",
  "",
  "---",
  "",
  "## [icon-siren-note] MUSIC & SOUND EFFECTS",
  "",
  "### Musical Score & Audio Composers",
  "- alkakrab : \"Pirate Game Music Pack\" (https://alkakrab.itch.io/pirate-game-music-pack)",
  "- Tracks : \"Silent Harbor\", \"Foggy Shores\", \"Ocean's Grasp\", \"Drunken Sailors\", \"Blackened Tide\", \"Windward Chase\", \"Sea Wolves\", \"Black Flag Rise\"",
  "- Lisette Amago : Music & Audio Design (https://lisetteamago.itch.io/)",
  "",
  "### Sound Effects",
  "- Pixabay : All Environmental Audio & Sound Effects (Pixabay Content License)",
  "- Sailing water wash & rough ocean ambience",
  "- Sea storm & howling wind (\"Sea-storm-wind\" #308764)",
  "- Kraken roar, rumble & underwater disturbances",
  "- Siren's alluring vocal call",
  "- Wood hull stress, creaking, knocks & splintering collisions",
  "- BoatLoad Audio Engine : Procedural Web Audio Synthesizer (Harpoon shots, QTE chimes, hit thuds)",
  "",
  "---",
  "",
  "## [icon-artist-palette] 3D MODELS & ANIMATION ASSETS",
  "",
  "### Quaternius (CC0 1.0 Public Domain)",
  "- Various models such as rocks, fish, boats by Quaternius",
  "- Universal Animation Library by Quaternius (https://quaternius.itch.io/universal-animation-library)",
  "",
  "### Poly Pizza & Google Poly 3D Assets [CC-BY]",
  "- Mountaintop by Matthew Burdette [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/8mWDJgGcXSH)",
  "- Mountain by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/7Jhw3p6TusU)",
  "- Low-poly landscape by sirkitree [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/bjsNFfddgOv)",
  "- Octopus by jeremy [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/6KQsV8qo5E0)",
  "- Mermaid by Kamylle B. Grenier [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/7X8_6iciXvk)",
  "- Octopus by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/9-b6-yqrwEe)",
  "- Wave by Poly by Google [CC-BY] via Poly Pizza (https://poly.pizza/m/6mpwUZqCgzy)",
  "- Kelp by Christopher F [CC-BY] via Poly Pizza (https://poly.pizza/m/3VhttTFyADO)",
  "- Rock by Danni Bittman [CC-BY] via Poly Pizza (https://poly.pizza/m/4TpBWdzKDf2)",
  "",
  "### Voxel Adaptations",
  "- Voxelized conversions and optimization performed by the development team",
  "",
  "---",
  "",
  "## [icon-compass] LIBRARIES & TECHNOLOGY",
  "",
  "- Three.js : 3D WebGL Rendering Engine (MIT License)",
  "- three-mesh-bvh : Spatial Raycasting & Accelerated Collisions (MIT License)",
  "- Vite : Frontend Build Tooling & Bundler (MIT License)",
  "",
  "---",
  "",
  "## [icon-ship-lantern] SPECIAL THANKS",
  "",
  "- Computer Graphics and Visualisation Course Staff (Wits University)",
  "- All playtesters who braved the rocky passages!",
  "",
  "---",
  "",
  "# FAIR WINDS & FOLLOWING SEAS",
  "~ Thank You for Playing BoatLoad! ~",
  ""
];

// Baseline snapshot used to detect if CREDITS_LIST vs credits.md was modified
const BASELINE_SIGNATURE = CREDITS_LIST.join('\n').trim();

/**
 * Parse a single plain-text or Markdown line into a normalized credit block.
 * @param {string} rawLine
 * @returns {object|null}
 */
export function parseCreditLine(rawLine) {
  if (typeof rawLine !== 'string') return null;
  const line = rawLine.trim();
  if (!line || line.startsWith('//') || line.startsWith('<!--')) return null;

  // Horizontal divider
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
    return { type: 'divider' };
  }

  // H1 Title: "# Title"
  if (line.startsWith('# ')) {
    return {
      type: 'title',
      text: line.slice(2).trim()
    };
  }

  // H2 Section: "## [icon-anchor] Section Title" or "## Section Title"
  if (line.startsWith('## ')) {
    const rest = line.slice(3).trim();
    const iconMatch = rest.match(/^\[([a-z0-9_-]+)\]\s*(.*)$/i);
    if (iconMatch) {
      return {
        type: 'section',
        icon: iconMatch[1],
        text: iconMatch[2].trim()
      };
    }
    return {
      type: 'section',
      icon: 'icon-nautical-star',
      text: rest
    };
  }

  // H3 Role / Subheading: "### Role"
  if (line.startsWith('### ')) {
    return {
      type: 'role',
      text: line.slice(4).trim()
    };
  }

  // Ribbon Subtitle: "~ Subtitle ~"
  if (line.startsWith('~') && line.endsWith('~') && line.length > 2) {
    return {
      type: 'subtitle',
      text: line.slice(1, -1).trim()
    };
  }

  // Blockquote: "> Quote"
  if (line.startsWith('>')) {
    return {
      type: 'quote',
      text: line.slice(1).trim().replace(/^["']|["']$/g, '')
    };
  }

  // Bullet or plain item: "- Name" or "- Label : Value" or "Plain text"
  const itemText = line.replace(/^[-*•]\s+/, '').trim();
  const colonIdx = itemText.indexOf(' : ');
  if (colonIdx !== -1) {
    return {
      type: 'pair',
      label: itemText.slice(0, colonIdx).trim(),
      value: itemText.slice(colonIdx + 3).trim()
    };
  }

  return {
    type: 'item',
    text: itemText
  };
}

/**
 * Normalize any credit input (Markdown string, array of strings, or array of objects)
 * into a flat array of renderable credit block objects.
 *
 * @param {string | Array<string|object>} [input]
 * @returns {Array<object>}
 */
export function parseCredits(input = CREDITS_LIST) {
  if (!input) return parseCredits(CREDITS_LIST);

  // 1. Plain string (e.g. contents of credits.md)
  if (typeof input === 'string') {
    const lines = input.split(/\r?\n/);
    const blocks = [];
    for (const line of lines) {
      const parsed = parseCreditLine(line);
      if (parsed) blocks.push(parsed);
    }
    return blocks;
  }

  // 2. Array of strings or structured objects
  if (Array.isArray(input)) {
    const blocks = [];
    for (const entry of input) {
      if (typeof entry === 'string') {
        // Support multi-line strings inside arrays too
        const subLines = entry.split(/\r?\n/);
        for (const subLine of subLines) {
          const parsed = parseCreditLine(subLine);
          if (parsed) blocks.push(parsed);
        }
      } else if (entry && typeof entry === 'object') {
        // Direct block object (already has { type, ... })
        if (entry.type) {
          blocks.push({ ...entry });
          continue;
        }
        // Structured section object: { section / title, icon?, role?, items / names? }
        if (entry.section || entry.heading) {
          blocks.push({
            type: 'section',
            icon: entry.icon || 'icon-nautical-star',
            text: entry.section || entry.heading
          });
        } else if (entry.title && !entry.name && !entry.value) {
          blocks.push({
            type: entry.items || entry.names ? 'section' : 'title',
            icon: entry.icon || 'icon-nautical-star',
            text: entry.title
          });
        }
        if (entry.subtitle) {
          blocks.push({ type: 'subtitle', text: entry.subtitle });
        }
        if (entry.role && (entry.name || entry.value)) {
          blocks.push({
            type: 'pair',
            label: entry.role,
            value: entry.name || entry.value
          });
        } else if (entry.role) {
          blocks.push({ type: 'role', text: entry.role });
        }
        if (entry.label && entry.value) {
          blocks.push({ type: 'pair', label: entry.label, value: entry.value });
        } else if (entry.name && !entry.role) {
          blocks.push({ type: 'item', text: entry.name });
        } else if (entry.text) {
          blocks.push({ type: 'item', text: entry.text });
        }
        const listItems = entry.items || entry.names;
        if (Array.isArray(listItems)) {
          for (const sub of listItems) {
            blocks.push(...parseCredits([sub]));
          }
        }
        if (entry.divider) {
          blocks.push({ type: 'divider' });
        }
      }
    }
    return blocks;
  }

  return parseCredits(CREDITS_LIST);
}

/**
 * Load credits from `customInput` if provided, or check `CREDITS.md` / `public/credits.md`
 * and `CREDITS_LIST` so edits to either the Markdown file or JS list are reflected.
 *
 * @param {string | Array<string|object> | null} [customInput]
 * @returns {Promise<Array<object>>}
 */
export async function loadCreditsBlocks(customInput = null) {
  if (customInput) {
    return parseCredits(customInput);
  }

  // If the developer modified CREDITS_LIST in CreditsConfig.js directly, prioritize it
  const currentListSignature = CREDITS_LIST.join('\n').trim();
  if (currentListSignature !== BASELINE_SIGNATURE) {
    return parseCredits(CREDITS_LIST);
  }

  // Otherwise try fetching CREDITS.md / credits.md so editing the markdown file works live
  if (typeof fetch === 'function') {
    const candidateUrls = [
      getAssetUrl('credits.md'),
      './CREDITS.md'
    ];
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res && res.ok) {
          const text = await res.text();
          // Ensure it's markdown/text and not an SPA index.html fallback
          if (text && !text.trim().toLowerCase().startsWith('<!doctype html')) {
            const parsed = parseCredits(text);
            if (parsed.length > 0) {
              return parsed;
            }
          }
        }
      } catch (_) {
        // Fallback to next candidate or CREDITS_LIST
      }
    }
  }

  return parseCredits(CREDITS_LIST);
}
