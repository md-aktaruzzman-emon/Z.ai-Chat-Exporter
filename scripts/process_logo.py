#!/usr/bin/env python3
"""
Process and generate all application logo assets, extension icons (16, 32, 48, 128),
and brand assets from the master design image.
"""

import os
import shutil
from PIL import Image, ImageDraw

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSETS_DIR = os.path.join(PROJECT_ROOT, "src", "assets")
ICONS_DIR = os.path.join(ASSETS_DIR, "icons")

SOURCE_IMG_DEFAULT = r"C:\Users\Md Aktaruzzman Emon\.gemini\antigravity\brain\302a07de-db18-4bd4-b813-8a660336e756\.user_uploaded\media_1792149199793_0bc01105.jpg"
LOCAL_SOURCE = os.path.join(ASSETS_DIR, "logo-source.jpg")

def process_logo(source_path=None):
    if source_path is None or not os.path.exists(source_path):
        source_path = LOCAL_SOURCE if os.path.exists(LOCAL_SOURCE) else SOURCE_IMG_DEFAULT
    
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source logo not found at {source_path}")

    # Ensure local source copy exists
    if source_path != LOCAL_SOURCE:
        shutil.copyfile(source_path, LOCAL_SOURCE)
        print(f"Copied master source to {LOCAL_SOURCE}")

    os.makedirs(ICONS_DIR, exist_ok=True)
    img = Image.open(source_path)
    print(f"Loaded master design: {img.size} ({img.mode})")

    # 1. Master Icon (512x512 squircle tile)
    # The 3D emblem center is at (cx=514, cy=280)
    crop_w = 480
    x1 = 514 - crop_w // 2  # 274
    y1 = 280 - crop_w // 2  # 40
    x2 = x1 + crop_w        # 754
    y2 = y1 + crop_w        # 520

    sq = img.crop((x1, y1, x2, y2)).copy()

    # Fill below emblem (y >= 425 in sq) with matching background color to eliminate text touch
    bg_color = sq.getpixel((240, 415))
    draw = ImageDraw.Draw(sq)
    for y in range(425, sq.height):
        draw.line([(0, y), (sq.width, y)], fill=bg_color)

    # Scale to 512x512
    master = sq.resize((512, 512), Image.Resampling.LANCZOS).convert("RGBA")

    # Supersampled anti-aliased squircle mask (4x)
    mask_hi = Image.new("L", (512 * 4, 512 * 4), 0)
    d_hi = ImageDraw.Draw(mask_hi)
    d_hi.rounded_rectangle([(0, 0), (512 * 4 - 1, 512 * 4 - 1)], radius=420, fill=255)
    mask_smooth = mask_hi.resize((512, 512), Image.Resampling.LANCZOS)
    master.putalpha(mask_smooth)

    master_path = os.path.join(ASSETS_DIR, "logo.png")
    master.save(master_path, "PNG")
    print(f"Saved master squircle logo: {master_path} (512x512)")

    # 2. Extension Icons (128, 48, 32, 16)
    sizes = [128, 48, 32, 16]
    for s in sizes:
        icon = master.resize((s, s), Image.Resampling.LANCZOS)
        icon_path = os.path.join(ICONS_DIR, f"{s}.png")
        icon.save(icon_path, "PNG")
        print(f"Generated extension icon: {icon_path} ({s}x{s})")

    # 3. Full Brand Logo (Emblem + Typography on Dark Background)
    # x: 120..904, y: 110..615 -> 784 x 505
    brand_logo = img.crop((120, 110, 904, 615)).convert("RGBA")
    brand_path = os.path.join(ASSETS_DIR, "logo-full.png")
    brand_logo.save(brand_path, "PNG")
    print(f"Saved full brand logo: {brand_path} ({brand_logo.size[0]}x{brand_logo.size[1]})")

    # 4. Light Background Logo
    light_logo = img.crop((341, 689, 682, 1024)).convert("RGBA")
    light_path = os.path.join(ASSETS_DIR, "logo-light.png")
    light_logo.save(light_path, "PNG")
    print(f"Saved light background logo: {light_path} ({light_logo.size[0]}x{light_logo.size[1]})")

    print("\nAll logo and icon assets processed successfully!")

if __name__ == "__main__":
    process_logo()
