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
  '# BOATLOAD',
  '~ Shipwreck & Sail ~',
  '> "Seven days on the treacherous seas, and the old hull still floats!"',
  '---',

  '## [icon-anchor] THE CREW — DEVELOPMENT TEAM',
  '### Shipwrights & Core Engineers',
  '- Yamlack Megersa',
  '- ZFakir',
  '- chrisgiles',
  '---',

  '## [icon-helm-wheel] GAME DESIGN & ARCHITECTURE',
  '### Voxel Shipyard & Hull Physics',
  '- Voxel Grid & Chunk Instancing Renderer',
  '- BVH Spatial Raycasting & Blueprint Snapping',
  '- Dynamic Buoyancy, Flooding & Hull Destruction',

  '### High Seas, Weather & Shaders',
  '- Procedural Gerstner Ocean Surface & Wave Physics',
  '- Volumetric God Rays & Painterly Paper Post-Processing',
  '- Dynamic Squalls, Sea Fog, Wind Gusts & Lightning',

  '### Monsters, Combat & Quick-Time Events',
  '- The Ancient Kraken Multi-Phase Boss Encounter',
  '- Siren Allure, Sharks & Harpoon Defense Stations',
  '- Swivel Deck Cannon & Emergency Repair QTEs',

  '### Harbor Dock & Economy',
  '- Island Dock Village & First-Person Harbour Walk',
  '- Ghost Merchant "Deadly Business" Outfitting Stall',
  '- Captain\'s Logbook & Voyage Ledger System',
  '---',

  '## [icon-siren-note] MUSIC, SHANTIES & SOUNDTRACK',
  '### Sea Shanties & Musical Score',
  '- Main Menu Theme : [Song Title] — [Artist / Composer]',
  '- Harbour & Shipyard Theme : [Song Title] — [Artist / Composer]',
  '- High Seas Voyage Theme : [Song Title] — [Artist / Composer]',
  '- Night Storm & Kraken Boss Theme : [Song Title] — [Artist / Composer]',
  '- Siren\'s Lullaby : [Song Title] — [Artist / Vocalist]',

  '### Sound Effects & Audio Engineering',
  '- Procedural Web Audio Synthesizer : BoatLoad Audio Engine',
  '- Ocean Waves, Wind & Storm Ambience : [Sound Designer / Source]',
  '- Cannon, Harpoon & Hull Impact SFX : [Sound Designer / Source]',
  '---',

  '## [icon-artist-palette] 3D MODELS & ART ASSETS',
  '### Voxel & Environmental 3D Models',
  '- Quaternius : Rocks, Barrels & Wood Planks',
  '- Danni Bittman : Voxel Reef Outcroppings',
  '- Christopher F : Bull Kelp & Seaweed Beds',
  '- Poly by Google : Crashing Waves & Island Peaks',
  '- sirkitree : Low-Poly Archipelago Landscapes',
  '- Matthew Burdette : Mountaintop Terrain',

  '### Interface & Visual Style',
  '- 16-Bit Pixel Art Nautical UI & 9-Slice Frames',
  '- Custom SVG Pirate Crest & Brass Telemetry Instruments',
  '---',

  '## [icon-compass] ENGINE & TECHNOLOGY',
  '- Three.js : 3D WebGL Rendering Engine',
  '- three-mesh-bvh : Accelerated Raycasting & Collisions',
  '- Vite : Frontend Build & Module Bundler',
  '---',

  '## [icon-ship-lantern] SPECIAL THANKS',
  '- Computer Graphics and Visualisation Course Staff',
  '- Every Helmsman & Shipwright Who Braved All Seven Days',
  '---',

  '# FAIR WINDS & FOLLOWING SEAS',
  '~ Thank You for Playing BoatLoad! ~'
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
