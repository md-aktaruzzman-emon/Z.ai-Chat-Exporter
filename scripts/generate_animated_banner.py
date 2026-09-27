import math
import os
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Configuration
WIDTH = 1600
HEIGHT = 500
NUM_FRAMES = 36  # Smooth 36 frames at 15 fps = 2.4s seamless loop
FPS = 15

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
ASSETS_DIR = os.path.join(PROJECT_ROOT, 'assets')
TEMP_FRAMES_DIR = os.path.join(SCRIPT_DIR, 'temp_frames')

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(TEMP_FRAMES_DIR, exist_ok=True)

# Input Assets
BG_SOURCE = r"C:\Users\Md Aktaruzzman Emon\.gemini\antigravity\brain\a4e1fac9-b5e9-41d8-88eb-ed7cb1e3dfdf\zai_3d_banner_bg_1790512702839.jpg"
LOGO_PATH = os.path.join(PROJECT_ROOT, "src", "assets", "logo.png")

# Load Fonts
FONT_TITLE_PATH = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REGULAR_PATH = r"C:\Windows\Fonts\segoeui.ttf"
FONT_MONO_PATH = r"C:\Windows\Fonts\consolab.ttf"

font_title = ImageFont.truetype(FONT_TITLE_PATH, 54)
font_title_3d = ImageFont.truetype(FONT_TITLE_PATH, 54)
font_subtitle = ImageFont.truetype(FONT_REGULAR_PATH, 23)
font_pill = ImageFont.truetype(FONT_TITLE_PATH, 15)
font_badge_title = ImageFont.truetype(FONT_TITLE_PATH, 14)
font_badge_desc = ImageFont.truetype(FONT_REGULAR_PATH, 13)
font_micro = ImageFont.truetype(FONT_MONO_PATH, 12)

# Load 3D artwork
artwork_raw = Image.open(BG_SOURCE).convert("RGBA")
art_aspect = artwork_raw.width / artwork_raw.height
art_h = 560
art_w = int(art_h * art_aspect)
artwork_scaled = artwork_raw.resize((art_w, art_h), Image.Resampling.LANCZOS)

# Load Z logo
logo_raw = Image.open(LOGO_PATH).convert("RGBA")
logo_img = logo_raw.resize((84, 84), Image.Resampling.LANCZOS)

# Create static base background canvas
def create_base_canvas():
    base = Image.new("RGBA", (WIDTH, HEIGHT), (8, 12, 22, 255))
    draw = ImageDraw.Draw(base)

    # Subtle vertical gradient (deep charcoal-navy to obsidian)
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(6 + ratio * 8)
        g = int(10 + ratio * 10)
        b = int(20 + ratio * 18)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

    # Subtle isometric grid lines on left half
    grid_color = (24, 45, 75, 45)
    for x in range(0, 920, 40):
        draw.line([(x, 0), (x, HEIGHT)], fill=grid_color, width=1)
    for y in range(0, HEIGHT, 40):
        draw.line([(0, y), (920, y)], fill=grid_color, width=1)

    # Soft ambient glow behind text (cyan and indigo)
    glow_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.ellipse([80, 80, 750, 420], fill=(20, 80, 160, 45))
    glow_draw.ellipse([140, 130, 580, 360], fill=(0, 200, 220, 30))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(60))

    base = Image.alpha_composite(base, glow_layer)
    return base

BASE_CANVAS = create_base_canvas()

# Particle stream definitions
particles = []
import random
random.seed(1337)
for i in range(24):
    particles.append({
        'x_start': random.uniform(550, 820),
        'x_end': random.uniform(1150, 1480),
        'y_start': random.uniform(180, 310),
        'y_end': random.uniform(120, 410),
        'phase': random.uniform(0, 1),
        'size': random.uniform(2.5, 4.5),
        'speed': random.uniform(0.9, 1.2),
        'color': random.choice([
            (6, 182, 212),   # Cyan
            (16, 185, 129),  # Emerald
            (99, 102, 241),  # Indigo
            (56, 189, 248)   # Sky
        ])
    })

print(f"Rendering {NUM_FRAMES} high-resolution frames...")

for frame_idx in range(NUM_FRAMES):
    progress = frame_idx / NUM_FRAMES
    frame = BASE_CANVAS.copy()

    # --- 1. Composite 3D Artwork on Right with gentle floating bobbing ---
    bob_y = int(math.sin(progress * 2 * math.pi) * 6)
    art_paste_x = WIDTH - art_w + 60
    art_paste_y = -30 + bob_y

    art_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    art_layer.paste(artwork_scaled, (art_paste_x, art_paste_y))

    # Soft alpha fade on left edge
    fade_mask = Image.new("L", (WIDTH, HEIGHT), 255)
    fade_draw = ImageDraw.Draw(fade_mask)
    fade_start = WIDTH - art_w + 60
    fade_end = fade_start + 280
    for x in range(fade_start, min(fade_end, WIDTH)):
        alpha = int(((x - fade_start) / (fade_end - fade_start)) * 255)
        fade_draw.line([(x, 0), (x, HEIGHT)], fill=alpha)
    for x in range(0, fade_start):
        fade_draw.line([(x, 0), (x, HEIGHT)], fill=0)

    frame.paste(art_layer, (0, 0), fade_mask)

    # --- 2. Animated Particle Flow ---
    particle_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(particle_layer)

    for p in particles:
        p_prog = (progress * p['speed'] + p['phase']) % 1.0
        px = p['x_start'] + (p['x_end'] - p['x_start']) * p_prog
        arc = math.sin(p_prog * math.pi) * 32
        py = p['y_start'] + (p['y_end'] - p['y_start']) * p_prog - arc

        alpha = int(math.sin(p_prog * math.pi) * 230)
        c = p['color']
        radius = p['size']

        p_draw.ellipse(
            [px - radius, py - radius, px + radius, py + radius],
            fill=(c[0], c[1], c[2], alpha)
        )
        p_draw.ellipse(
            [px - radius * 2, py - radius * 2, px + radius * 2, py + radius * 2],
            fill=(c[0], c[1], c[2], int(alpha * 0.35))
        )

    frame = Image.alpha_composite(frame, particle_layer)

    # --- 3. Typography & UI Layout (Left Side) ---
    draw = ImageDraw.Draw(frame)

    # Top Status Badge: ● CHROME EXTENSION  |  V2.1.0  |  MANIFEST V3
    status_y = 65
    status_pulse = 0.5 + 0.5 * math.sin(progress * 2 * math.pi)
    dot_color = (
        int(16 + status_pulse * 40),
        int(185 + status_pulse * 50),
        int(129 + status_pulse * 40),
        255
    )
    draw.ellipse([82, status_y + 4, 92, status_y + 14], fill=dot_color)
    draw.text(
        (104, status_y),
        "CHROME EXTENSION   |   V2.1.0   |   MANIFEST V3",
        font=font_micro,
        fill=(148, 163, 184, 255) # Slate 400
    )

    # Logo + Title
    title_y = 110
    logo_y = title_y - 8

    # Logo with glowing neon ring
    glow_pulse = int(30 + 15 * math.sin(progress * 2 * math.pi))
    logo_glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    lg_draw = ImageDraw.Draw(logo_glow)
    lg_draw.ellipse([68, logo_y - 10, 68 + 108, logo_y + 96], fill=(6, 182, 212, glow_pulse))
    logo_glow = logo_glow.filter(ImageFilter.GaussianBlur(16))
    frame = Image.alpha_composite(frame, logo_glow)

    frame.paste(logo_img, (80, logo_y), logo_img)

    # 3D Extruded Title: "Z.ai Chat Exporter"
    text_x = 184
    title_text = "Z.ai Chat Exporter"

    # Multi-layer 3D Extrusion Shadows
    draw = ImageDraw.Draw(frame)
    for depth in range(5, 0, -1):
        draw.text((text_x + depth, title_y + depth), title_text, font=font_title_3d, fill=(8, 20, 36, 230))

    # Glow shadow behind main text
    title_glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    tg_draw = ImageDraw.Draw(title_glow)
    tg_draw.text((text_x, title_y), title_text, font=font_title, fill=(6, 182, 212, 95))
    title_glow = title_glow.filter(ImageFilter.GaussianBlur(12))
    frame = Image.alpha_composite(frame, title_glow)

    # Crisp pure white main title
    draw = ImageDraw.Draw(frame)
    draw.text((text_x, title_y), title_text, font=font_title, fill=(248, 250, 252, 255))

    # Subtitle
    sub_y = 196
    sub_text = "Export Z.ai conversations into structured, publication-quality documents."
    draw.text((82, sub_y), sub_text, font=font_subtitle, fill=(203, 213, 225, 255)) # Slate 300

    # Format Pills (Pure text labels without tofu box symbols)
    pills_y = 252
    pills = [
        {"name": "PDF", "border": (239, 68, 68), "bg": (239, 68, 68, 35)},
        {"name": "DOCX", "border": (59, 130, 246), "bg": (59, 130, 246, 35)},
        {"name": "MARKDOWN", "border": (168, 85, 247), "bg": (168, 85, 247, 35)},
        {"name": "HTML", "border": (245, 158, 11), "bg": (245, 158, 11, 35)},
        {"name": "JSON", "border": (16, 185, 129), "bg": (16, 185, 129, 35)},
        {"name": "CSV / TXT", "border": (100, 116, 139), "bg": (100, 116, 139, 35)},
    ]

    pill_x = 82
    for p in pills:
        label = p['name']
        bbox = draw.textbbox((0, 0), label, font=font_pill)
        w = (bbox[2] - bbox[0]) + 26
        h = 32

        pill_overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        p_draw = ImageDraw.Draw(pill_overlay)
        p_draw.rounded_rectangle(
            [pill_x, pills_y, pill_x + w, pills_y + h],
            radius=6,
            fill=p['bg'],
            outline=p['border'] + (200,),
            width=1
        )
        p_draw.text((pill_x + 13, pills_y + 7), label, font=font_pill, fill=(241, 245, 249, 255))
        frame = Image.alpha_composite(frame, pill_overlay)
        draw = ImageDraw.Draw(frame)

        pill_x += w + 10

    # Key Features Strip
    feat_y = 325
    features = [
        ("100% LOCAL PRIVACY", "Zero external network calls"),
        ("STRUCTURED LAYOUT", "Pre-measured, zero overlap"),
        ("FULL-CHAT COLLECTOR", "Virtualized scroll capture")
    ]

    fx = 82
    for title, desc in features:
        draw.text((fx, feat_y), title, font=font_badge_title, fill=(56, 189, 248, 255)) # Sky 400
        draw.text((fx, feat_y + 22), desc, font=font_badge_desc, fill=(148, 163, 184, 230)) # Slate 400
        fx += 235

    # Bottom Technical Line / Divider
    draw.line([(82, 420), (WIDTH - 80, 420)], fill=(30, 41, 59, 200), width=1)
    draw.text(
        (82, 436),
        "TARGET: CHAT.Z.AI   |   MULTI-LANGUAGE (EN / BN)   |   OPEN SOURCE (MIT)",
        font=font_micro,
        fill=(100, 116, 139, 240)
    )

    # --- 4. Subtle Shimmer / Diagonal Light Sweep Effect ---
    shimmer_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shimmer_layer)
    sweep_x = -350 + progress * (WIDTH + 700)
    sweep_width = 160

    s_draw.polygon(
        [
            (sweep_x, 0),
            (sweep_x + sweep_width, 0),
            (sweep_x + sweep_width - 90, HEIGHT),
            (sweep_x - 90, HEIGHT)
        ],
        fill=(255, 255, 255, 14)
    )
    shimmer_layer = shimmer_layer.filter(ImageFilter.GaussianBlur(30))
    frame = Image.alpha_composite(frame, shimmer_layer)

    # Save frame as PNG
    frame_path = os.path.join(TEMP_FRAMES_DIR, f"frame_{frame_idx:03d}.png")
    frame.convert("RGB").save(frame_path, "PNG")

    # Frame 0 is also saved as static banner.png
    if frame_idx == 0:
        static_banner_path = os.path.join(ASSETS_DIR, "banner.png")
        frame.convert("RGB").save(static_banner_path, "PNG")
        print(f"Saved static fallback: {static_banner_path}")

print("All frames rendered! Compiling GIF with FFmpeg...")

gif_output_path = os.path.join(ASSETS_DIR, "banner.gif")
palette_path = os.path.join(TEMP_FRAMES_DIR, "palette.png")

# Use FFmpeg palettegen with max_colors=96 for high quality and compact GIF size
cmd_palette = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", os.path.join(TEMP_FRAMES_DIR, "frame_%03d.png"),
    "-vf", "fps=15,scale=1280:400:flags=lanczos,palettegen=max_colors=96:reserve_transparent=0:stats_mode=diff",
    palette_path
]

cmd_gif = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", os.path.join(TEMP_FRAMES_DIR, "frame_%03d.png"),
    "-i", palette_path,
    "-lavfi", "fps=15,scale=1280:400:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3",
    gif_output_path
]

subprocess.run(cmd_palette, check=True)
subprocess.run(cmd_gif, check=True)

# Clean up temp frames
shutil.rmtree(TEMP_FRAMES_DIR)
print(f"Animated banner generated successfully at: {gif_output_path}")
print(f"GIF size: {os.path.getsize(gif_output_path) / 1024:.1f} KB")
