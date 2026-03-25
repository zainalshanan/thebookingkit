"""
Favicon generator for The Booking Kit
Design: Rounded dark square with a stylized "S" lettermark built from
        a calendar-slot metaphor — the letter S formed using three
        horizontal pill bars (representing time slots) in brand red (#e94560)
        on dark navy (#0f0f1a) background.

At 16px the S letterform reads as a bold monogram.
At 32px/48px the slot-bar construction becomes legible.
"""

from PIL import Image, ImageDraw
import math
import os

# Brand colors
BG       = (15, 15, 26)          # #0f0f1a  — primary dark
RED      = (233, 69, 96)         # #e94560  — brand accent
RED_DIM  = (180, 45, 68)         # slightly darker for depth on small bars

def draw_favicon(size: int) -> Image.Image:
    """
    Render the favicon at the given square pixel size.

    Design anatomy (proportions scale with `size`):
    - Background: rounded square, corner radius = 22% of size
    - Three horizontal bars forming an "S" curve / slot-stack motif:
        Top bar    — full width, left-anchored  (top third)
        Middle bar — full width, centered       (middle)
        Bottom bar — full width, right-anchored (bottom third)
      The staggered left/right anchoring creates an implied S-curve
      while each individual bar reads as a "time slot".
    - Bar height: ~14% of size
    - Bar width:  ~62% of size
    - Gap between bars: ~10% of size
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- Background rounded square ---
    r = max(2, round(size * 0.22))   # corner radius
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=r,
        fill=BG,
    )

    # --- Slot bars ---
    bar_h   = max(2, round(size * 0.145))   # bar height
    bar_w   = round(size * 0.60)            # bar width
    gap     = max(1, round(size * 0.095))   # gap between bars
    pad_x   = round(size * 0.13)            # horizontal inset from edge
    bar_r   = max(1, bar_h // 2)            # bar corner radius (pill)

    # Total height of the three-bar stack
    stack_h = bar_h * 3 + gap * 2
    # Vertically center the stack with a slight upward nudge
    top_y   = round((size - stack_h) / 2) - max(1, round(size * 0.02))

    # Bar offsets: staggered left/right to imply an S curve
    #   Top    bar → left-anchored  (x starts at pad_x)
    #   Middle bar → right-anchored (x ends at size - pad_x)
    #   Bottom bar → left-anchored
    offsets = [
        pad_x,                        # top:    left anchor
        size - pad_x - bar_w,         # middle: right anchor
        pad_x,                        # bottom: left anchor
    ]

    for i, x0 in enumerate(offsets):
        y0 = top_y + i * (bar_h + gap)
        x1 = x0 + bar_w
        y1 = y0 + bar_h
        draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=bar_r, fill=RED)

    return img


def build_ico(output_path: str):
    sizes = [16, 24, 32, 48]
    frames = [draw_favicon(s) for s in sizes]
    # PIL writes a proper multi-resolution ICO when given a list of images.
    frames[0].save(
        output_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:],
    )
    print(f"Saved {output_path}  ({', '.join(str(s)+'px' for s in sizes)})")


def build_png_previews(out_dir: str):
    """Save individual PNGs for inspection."""
    os.makedirs(out_dir, exist_ok=True)
    for s in [16, 32, 48, 128, 256]:
        img = draw_favicon(s)
        path = os.path.join(out_dir, f"favicon-{s}.png")
        img.save(path, format="PNG")
        print(f"Preview: {path}")


if __name__ == "__main__":
    ico_path = "/Users/zain/Desktop/slotkit/apps/demo/public/favicon.ico"
    preview_dir = "/Users/zain/Desktop/slotkit/apps/demo/public/favicon-previews"

    # Ensure the public dir exists
    os.makedirs("/Users/zain/Desktop/slotkit/apps/demo/public", exist_ok=True)

    build_ico(ico_path)
    build_png_previews(preview_dir)
