#!/usr/bin/env python3
"""
BoatLoad — Automated Spritesheet Slicer & JPEG-to-PNG Converter
Handles JPEG inputs from Nano Banana:
- Reads .jpg, .jpeg, or .png from public/assets/ui/raw_sheets/
- Flood-fills out solid background (e.g. solid black #000000 or solid white) with JPEG noise tolerance
- Preserves black/dark pixels inside the sprites
- Nearest-neighbor scales and centers each icon into clean transparent PNGs
"""

import os
import sys
import json
from pathlib import Path
from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
MANIFEST_PATH = SCRIPT_DIR / "spritesheet_manifest.json"
RAW_SHEETS_DIR = PROJECT_ROOT / "public" / "assets" / "ui" / "raw_sheets"

VALID_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"]

GEMINI_SHEET_MAP = {
    "sheet_maritime": "nautical_icons_sheet.png",
    "sheet_tools": "crafting_tools_sheet.png",
    "sheet_combat": "pirate_combat_sheet.png",
    "sheet_weather": "weather_sky_icons_sheet.png",
    "sheet_system": "media_ui_icons_sheet.png",
    "sheet_badges_biomes": "game_ui_icons_sheet.png",
    "sheet_brushes_materials": "nautical_materials_sheet.png",
}

def find_sheet_file(base_name):
    """Finds image file matching base_name with any common extension (.jpg, .png, etc.), or user alias."""
    stem = Path(base_name).stem
    
    # Check known aliases first
    if stem in GEMINI_SHEET_MAP:
        alias_file = RAW_SHEETS_DIR / GEMINI_SHEET_MAP[stem]
        if alias_file.exists():
            return alias_file

    # Check direct name
    for ext in VALID_EXTENSIONS:
        candidate = RAW_SHEETS_DIR / f"{stem}{ext}"
        if candidate.exists():
            return candidate
            
    # Check project root fallback
    for ext in VALID_EXTENSIONS:
        candidate = PROJECT_ROOT / f"{stem}{ext}"
        if candidate.exists():
            return candidate

    # Keyword fallback
    clean_stem = stem.replace("sheet_", "")
    if RAW_SHEETS_DIR.exists():
        for f in RAW_SHEETS_DIR.iterdir():
            if f.suffix in VALID_EXTENSIONS and clean_stem in f.stem.lower():
                return f

    return None

def clean_jpeg_background(cell_img, thresh=42):
    """
    If the image is already transparent PNG, returns it directly.
    Otherwise converts RGB to RGBA and uses perimeter boundary flood-fill to carve away
    the background color.
    """
    img = cell_img.convert("RGBA")
    
    # If the cell already has alpha transparency (prepared by user), don't touch it!
    alpha = img.split()[-1]
    if alpha.getextrema()[0] == 0:
        return img

    w, h = img.size
    
    # Sample boundary pixels around the outer perimeter
    border_points = []
    for x in range(0, w, 2):
        border_points.append((x, 0))
        border_points.append((x, h - 1))
    for y in range(0, h, 2):
        border_points.append((0, y))
        border_points.append((w - 1, y))

    border_colors = [img.getpixel(pt)[:3] for pt in border_points]
    # Median background color
    median_color = sorted(border_colors, key=lambda c: sum(c))[len(border_colors) // 2]
    
    # Flood-fill from every border seed that matches the background color within threshold
    for seed in border_points:
        curr = img.getpixel(seed)
        if curr[3] == 0:
            continue
        diff = sum(abs(curr[i] - median_color[i]) for i in range(3))
        if diff <= thresh * 2.5:
            try:
                ImageDraw.floodfill(img, seed, (0, 0, 0, 0), thresh=thresh)
            except Exception:
                pass

    # Secondary sweep: clear any remaining 2px edge contact artifacts
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            if x < 2 or x >= w - 2 or y < 2 or y >= h - 2:
                p = pixels[x, y]
                if p[3] > 0 and sum(abs(p[i] - median_color[i]) for i in range(3)) <= thresh * 1.8:
                    pixels[x, y] = (0, 0, 0, 0)

    return img

def auto_crop_and_fit(cell_img, target_w, target_h):
    """Trims transparent boundary, resizes cleanly, and centers in target canvas."""
    bbox = cell_img.getbbox()
    if bbox:
        cropped = cell_img.crop(bbox)
    else:
        cropped = cell_img

    cw, ch = cropped.size
    if cw <= 1 or ch <= 1:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))

    # Maintain padding inside icon boundary
    max_w = target_w - 2
    max_h = target_h - 2
    scale = min(max_w / cw, max_h / ch)

    if scale > 1.0:
        new_w = max(1, int(round(cw * scale)))
        new_h = max(1, int(round(ch * scale)))
        resized = cropped.resize((new_w, new_h), Image.Resampling.NEAREST)
    else:
        new_w = max(1, int(round(cw * scale)))
        new_h = max(1, int(round(ch * scale)))
        resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    paste_x = (target_w - new_w) // 2
    paste_y = (target_h - new_h) // 2
    canvas.paste(resized, (paste_x, paste_y), resized)

    return canvas

def slice_sheet(sheet_conf):
    base_name = sheet_conf["sheetFile"]
    sheet_path = find_sheet_file(base_name)

    if not sheet_path:
        print(f" [WAITING] Missing: {base_name} (Save as .jpg or .png in public/assets/ui/raw_sheets/)")
        return 0

    print(f"\nProcessing Spritesheet: {sheet_path.name} ({sheet_path.suffix.upper()}) ...")
    raw_img = Image.open(sheet_path)

    rows, cols = sheet_conf["grid"]
    target_w, target_h = sheet_conf["targetSize"]
    out_dir = PROJECT_ROOT / sheet_conf["outputDir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet_w, sheet_h = raw_img.size
    cell_w = sheet_w / cols
    cell_h = sheet_h / rows

    saved_count = 0
    for cell in sheet_conf["cells"]:
        r = cell["row"]
        c = cell["col"]
        out_name = cell["filename"]
        friendly = cell.get("name", out_name)

        # Slice cell boundary
        left = int(c * cell_w)
        top = int(r * cell_h)
        right = int((c + 1) * cell_w)
        bottom = int((r + 1) * cell_h)

        cell_crop = raw_img.crop((left, top, right, bottom))
        
        # Remove JPEG solid background & artifacts
        cell_transparent = clean_jpeg_background(cell_crop)
        
        # Fit into target pixel canvas
        icon_final = auto_crop_and_fit(cell_transparent, target_w, target_h)

        # Always save as high quality transparent PNG
        out_path = out_dir / out_name
        icon_final.save(out_path, format="PNG")
        try:
            print(f"   [OK] [PNG] {out_name:<28} <- Cell ({r}, {c}) {friendly}")
        except Exception:
            print(f"   [OK] [PNG] {out_name:<28} <- Cell ({r}, {c})")
        saved_count += 1

    return saved_count

FRAME_MAP = [
    {
        "source": "wooden_panel_brass_corners.png",
        "target": "public/assets/ui/frames/frame_main_menu_plaque.png",
        "size": (256, 256)
    },
    {
        "source": "open_tome.png",
        "target": "public/assets/ui/frames/modal_logbook_spread.png",
        "size": (640, 440)
    },
    {
        "source": "framed_chalkboard_slate.png",
        "target": "public/assets/ui/frames/frame_pause_cabinet.png",
        "size": (256, 256)
    },
    {
        "source": "parchment_ledger.png",
        "target": "public/assets/ui/frames/frame_results_manifest.png",
        "size": (440, 520)
    }
]

def process_frames():
    print("\nProcessing Standalone Modal Frames & Containers...")
    processed = 0
    for frame_info in FRAME_MAP:
        src = RAW_SHEETS_DIR / frame_info["source"]
        if not src.exists():
            continue
        tgt = PROJECT_ROOT / frame_info["target"]
        tgt.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(src).convert("RGBA")
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        target_size = frame_info.get("size")
        if target_size:
            img = img.resize(target_size, Image.Resampling.LANCZOS)
        img.save(tgt, format="PNG")
        print(f"   [OK] [FRAME] {tgt.name:<32} <- {src.name}")
        processed += 1
    return processed

def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("=" * 68)
    print(" BoatLoad - Automated Spritesheet Slicer & JPEG->PNG Converter")
    print(f" Reading manifest: {MANIFEST_PATH.name}")
    print(f" Raw sheets folder: {RAW_SHEETS_DIR}")
    print(" Input formats accepted: .jpg, .jpeg, .png, .webp")
    print(" Output format: Clean transparent .png in public/assets/ui/icons/")
    print("=" * 68)

    if not MANIFEST_PATH.exists():
        print(f"Error: Manifest file missing at {MANIFEST_PATH}")
        sys.exit(1)

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    total_extracted = 0
    sheets = data.get("sheets", [])

    for s in sheets:
        count = slice_sheet(s)
        total_extracted += count

    frames_count = process_frames()

    print("\n" + "=" * 68)
    if total_extracted > 0 or frames_count > 0:
        print(f" SUCCESS: {total_extracted} transparent icons + {frames_count} frames extracted and wired!")
    else:
        print(" WAITING: Drop your downloaded JPEG/PNG spritesheets into:")
        print(f"   --> {RAW_SHEETS_DIR}")
        print(" Then run: python scripts/slice_spritesheets.py")
    print("=" * 68)

if __name__ == "__main__":
    main()
