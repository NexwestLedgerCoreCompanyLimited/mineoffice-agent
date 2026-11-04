"""Generates faces and role icons for the software team, in the style of the original crew.

Run with: python scripts/generate_team_art.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"

OUTLINE = (38, 32, 42, 255)
SKIN = {
    "fair": (240, 200, 165, 255),
    "tan": (214, 165, 120, 255),
    "brown": (160, 110, 75, 255),
    "deep": (105, 70, 50, 255),
}
EYE_WHITE = (245, 245, 240, 255)


def face(skin, hair, eyes, style, accent=None):
    """An 8x8 Minecraft-style face. Style sets the hair shape and any accessory."""
    image = Image.new("RGBA", (8, 8), SKIN[skin])
    pixels = image.load()
    for x in range(8):
        pixels[x, 0] = hair
        pixels[x, 1] = hair
    # Eyes and mouth
    for x, y, color in [(1, 4, EYE_WHITE), (2, 4, eyes), (5, 4, eyes), (6, 4, EYE_WHITE)]:
        pixels[x, y] = color
    shade = tuple(int(channel * 0.72) for channel in SKIN[skin][:3]) + (255,)
    pixels[3, 6] = shade
    pixels[4, 6] = shade

    if style in ("long", "fringe"):
        for y in range(2, 7 if style == "long" else 4):
            pixels[0, y] = hair
            pixels[7, y] = hair
    if style == "fringe":
        for x in range(1, 5):
            pixels[x, 2] = hair
    if style == "side":
        for x in range(4, 8):
            pixels[x, 2] = hair
        pixels[7, 3] = hair
    if style == "bun":
        pixels[0, 2] = hair
        pixels[7, 2] = hair
        pixels[3, 0] = accent or hair
        pixels[4, 0] = accent or hair
    if style == "beard":
        for x in range(1, 7):
            pixels[x, 6] = hair
            pixels[x, 7] = hair
        pixels[3, 6] = shade
        pixels[4, 6] = shade
    if style == "glasses":
        frame = accent or OUTLINE
        for x in (0, 3, 4, 7):
            pixels[x, 4] = frame
        for x in (1, 2, 5, 6):
            pixels[x, 3] = frame
    if style == "visor":
        visor = accent or (84, 205, 225, 255)
        for x in range(8):
            pixels[x, 3] = OUTLINE
            pixels[x, 4] = visor
    if style == "headset":
        band = accent or (98, 104, 118, 255)
        for x in range(8):
            pixels[x, 0] = band
        pixels[0, 3] = band
        pixels[0, 4] = band
        pixels[7, 3] = band
        pixels[7, 4] = band
    if style == "cap":
        cap = accent or hair
        for x in range(8):
            pixels[x, 0] = cap
            pixels[x, 1] = cap
        for x in range(3, 8):
            pixels[x, 2] = cap
    return image


FACES = {
    "sage": face("tan", (92, 58, 33, 255), (52, 90, 60, 255), "bun", (247, 197, 62, 255)),
    "ellis": face("fair", (40, 44, 60, 255), (60, 80, 150, 255), "glasses"),
    "iris": face("brown", (120, 60, 150, 255), (70, 40, 90, 255), "long"),
    "fern": face("fair", (214, 90, 130, 255), (40, 120, 90, 255), "fringe"),
    "ash": face("tan", (150, 156, 168, 255), (50, 60, 80, 255), "beard"),
    "briar": face("deep", (30, 28, 34, 255), (60, 40, 30, 255), "glasses", (247, 197, 62, 255)),
    "robin": face("fair", (190, 80, 44, 255), (50, 110, 170, 255), "side"),
    "hollis": face("brown", (24, 22, 30, 255), (40, 30, 24, 255), "headset", (84, 205, 225, 255)),
    "reed": face("tan", (34, 40, 48, 255), (40, 30, 24, 255), "cap", (66, 96, 200, 255)),
    "quinn": face("deep", (214, 140, 34, 255), (50, 34, 24, 255), "fringe"),
    "linden": face("fair", (225, 190, 110, 255), (60, 120, 160, 255), "long"),
    "moss": face("tan", (60, 110, 70, 255), (40, 60, 40, 255), "side"),
    "aspen": face("brown", (235, 235, 235, 255), (70, 50, 110, 255), "bun", (150, 80, 200, 255)),
    "flint": face("fair", (70, 70, 78, 255), (120, 60, 40, 255), "beard"),
    "onyx": face("deep", (20, 20, 26, 255), (214, 64, 58, 255), "visor", (214, 64, 58, 255)),
    "clover": face("fair", (70, 150, 80, 255), (40, 100, 60, 255), "headset", (86, 186, 92, 255)),
    "page": face("tan", (120, 70, 40, 255), (60, 40, 30, 255), "glasses", (133, 88, 52, 255)),
}


def framed(portrait):
    """The 20x20 version with a dark frame and a coloured edge, matching the original portraits."""
    frame = Image.new("RGBA", (20, 20), OUTLINE)
    inner = ImageDraw.Draw(frame)
    inner.rectangle([1, 1, 18, 18], fill=(86, 72, 110, 255))
    frame.paste(portrait.resize((16, 16), Image.NEAREST), (2, 2))
    return frame


def icon(draw_on):
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw_on(ImageDraw.Draw(image))
    return image


def box(d, x0, y0, x1, y1, fill, outline=OUTLINE):
    d.rectangle([x0, y0, x1, y1], fill=fill, outline=outline)


WHITE = (245, 245, 240, 255)
STEEL = (150, 156, 168, 255)
DARK = (52, 54, 66, 255)
GOLD = (247, 197, 62, 255)
RED = (214, 64, 58, 255)
CYAN = (84, 205, 225, 255)
GREEN = (86, 186, 92, 255)
BLUE = (66, 96, 200, 255)
PURPLE = (150, 80, 200, 255)
PINK = (235, 110, 160, 255)
WOOD = (133, 88, 52, 255)


def product_manager(d):  # clipboard with a checklist
    box(d, 2, 2, 13, 15, WOOD)
    box(d, 4, 3, 11, 14, WHITE)
    box(d, 5, 1, 10, 3, STEEL)
    for y in (6, 9, 12):
        d.point((5, y), fill=GREEN)
        d.line([7, y, 10, y], fill=DARK)


def business_analyst(d):  # bar chart
    box(d, 1, 1, 14, 14, WHITE)
    d.rectangle([3, 9, 4, 13], fill=BLUE)
    d.rectangle([6, 6, 7, 13], fill=GREEN)
    d.rectangle([9, 8, 10, 13], fill=GOLD)
    d.rectangle([12, 3, 13, 13], fill=RED)


def ux_designer(d):  # wireframe of a screen
    box(d, 1, 2, 14, 13, WHITE)
    d.rectangle([3, 4, 12, 5], fill=STEEL)
    d.rectangle([3, 7, 6, 11], fill=CYAN)
    d.line([8, 7, 12, 7], fill=DARK)
    d.line([8, 9, 12, 9], fill=DARK)
    d.line([8, 11, 11, 11], fill=DARK)


def ui_designer(d):  # paint palette
    d.ellipse([1, 2, 14, 13], fill=(214, 170, 120, 255), outline=OUTLINE)
    for x, y, color in [(4, 5, RED), (7, 4, GOLD), (10, 5, GREEN), (11, 8, BLUE), (4, 9, PINK)]:
        d.rectangle([x, y, x + 1, y + 1], fill=color)
    d.rectangle([7, 9, 8, 10], fill=(90, 60, 40, 255))


def architect(d):  # blueprint with a building outline
    box(d, 1, 1, 14, 14, (36, 96, 170, 255))
    d.line([4, 12, 4, 6], fill=WHITE)
    d.line([4, 6, 8, 3], fill=WHITE)
    d.line([8, 3, 11, 6], fill=WHITE)
    d.line([11, 6, 11, 12], fill=WHITE)
    d.line([4, 12, 11, 12], fill=WHITE)
    d.rectangle([7, 9, 8, 12], fill=CYAN)


def tech_lead(d):  # badge with a star
    d.rectangle([5, 0, 6, 4], fill=RED)
    d.rectangle([9, 0, 10, 4], fill=BLUE)
    d.ellipse([2, 3, 13, 14], fill=GOLD, outline=OUTLINE)
    d.line([8, 5, 8, 12], fill=WHITE)
    d.line([5, 8, 11, 8], fill=WHITE)
    d.point([(6, 6), (10, 6), (6, 10), (10, 10)], fill=WHITE)


def frontend(d):  # browser window
    box(d, 1, 2, 14, 13, WHITE)
    d.rectangle([2, 3, 13, 4], fill=STEEL)
    d.point([(3, 3), (5, 3)], fill=RED)
    d.rectangle([3, 6, 7, 11], fill=CYAN)
    d.rectangle([9, 6, 12, 7], fill=GOLD)
    d.rectangle([9, 9, 12, 11], fill=PINK)


def backend(d):  # server rack
    for y in (1, 6, 11):
        box(d, 2, y, 13, y + 4, DARK)
        d.point((4, y + 2), fill=GREEN)
        d.point((6, y + 2), fill=GOLD)
        d.line([8, y + 2, 11, y + 2], fill=STEEL)


def mobile(d):  # phone
    box(d, 4, 0, 11, 15, DARK)
    d.rectangle([5, 2, 10, 12], fill=CYAN)
    d.rectangle([6, 4, 9, 5], fill=WHITE)
    d.rectangle([6, 7, 9, 10], fill=BLUE)
    d.point((7, 14), fill=WHITE)
    d.point((8, 14), fill=WHITE)


def data_engineer(d):  # database cylinder
    d.ellipse([2, 1, 13, 5], fill=(90, 190, 170, 255), outline=OUTLINE)
    d.rectangle([2, 3, 13, 12], fill=(60, 150, 140, 255))
    d.line([2, 3, 2, 12], fill=OUTLINE)
    d.line([13, 3, 13, 12], fill=OUTLINE)
    d.ellipse([2, 10, 13, 14], fill=(60, 150, 140, 255), outline=OUTLINE)
    d.ellipse([2, 1, 13, 5], fill=(90, 190, 170, 255), outline=OUTLINE)
    d.line([3, 7, 12, 7], fill=OUTLINE)


def ml_engineer(d):  # chip with connected points
    box(d, 3, 3, 12, 12, PURPLE)
    for at in (5, 7, 9):
        d.line([at, 0, at, 2], fill=STEEL)
        d.line([at, 13, at, 15], fill=STEEL)
        d.line([0, at, 2, at], fill=STEEL)
        d.line([13, at, 15, at], fill=STEEL)
    d.point([(5, 5), (10, 6), (7, 8), (5, 10), (10, 10)], fill=WHITE)
    d.line([5, 5, 7, 8], fill=PINK)
    d.line([10, 6, 7, 8], fill=PINK)
    d.line([7, 8, 10, 10], fill=PINK)


def devops(d):  # gear
    d.rectangle([6, 0, 9, 15], fill=STEEL)
    d.rectangle([0, 6, 15, 9], fill=STEEL)
    d.line([2, 2, 13, 13], fill=STEEL, width=3)
    d.line([13, 2, 2, 13], fill=STEEL, width=3)
    d.ellipse([2, 2, 13, 13], fill=STEEL, outline=OUTLINE)
    d.ellipse([5, 5, 10, 10], fill=DARK, outline=OUTLINE)


def security(d):  # shield with a keyhole
    d.polygon([(2, 1), (13, 1), (13, 8), (8, 15), (7, 15), (2, 8)], fill=BLUE, outline=OUTLINE)
    d.rectangle([7, 4, 8, 7], fill=GOLD)
    d.rectangle([6, 4, 9, 5], fill=GOLD)
    d.rectangle([7, 8, 8, 10], fill=GOLD)


def qa(d):  # magnifying glass over a bug
    d.ellipse([1, 1, 10, 10], fill=WHITE, outline=OUTLINE)
    d.rectangle([4, 4, 7, 8], fill=RED)
    d.point([(3, 4), (8, 4), (3, 7), (8, 7)], fill=OUTLINE)
    d.line([10, 10, 14, 14], fill=WOOD, width=2)


def tech_writer(d):  # open book
    d.rectangle([1, 3, 7, 13], fill=WHITE, outline=OUTLINE)
    d.rectangle([8, 3, 14, 13], fill=WHITE, outline=OUTLINE)
    for y in (5, 7, 9, 11):
        d.line([3, y, 6, y], fill=STEEL)
        d.line([9, y, 12, y], fill=STEEL)
    d.line([7, 2, 8, 2], fill=RED)


ICONS = {
    "product_manager": product_manager,
    "business_analyst": business_analyst,
    "ux_designer": ux_designer,
    "ui_designer": ui_designer,
    "architect": architect,
    "tech_lead": tech_lead,
    "frontend": frontend,
    "backend": backend,
    "mobile": mobile,
    "data_engineer": data_engineer,
    "ml_engineer": ml_engineer,
    "devops": devops,
    "security": security,
    "qa": qa,
    "tech_writer": tech_writer,
}


def main() -> None:
    for name, portrait in FACES.items():
        portrait.save(ASSETS / "portraits" / f"{name}.png")
        framed(portrait).save(ASSETS / "portraits" / f"{name}_framed.png")
    for name, draw_on in ICONS.items():
        icon(draw_on).save(ASSETS / "icons" / f"role_{name}.png")

    # A contact sheet, to look at them all at once
    sheet = Image.new("RGBA", (10 * 72, 4 * 72), (240, 243, 248, 255))
    for index, portrait in enumerate(FACES.values()):
        sheet.paste(portrait.resize((64, 64), Image.NEAREST), (4 + (index % 10) * 72, 4 + (index // 10) * 72))
    for index, draw_on in enumerate(ICONS.values()):
        rendered = icon(draw_on).resize((64, 64), Image.NEAREST)
        sheet.paste(rendered, (4 + (index % 10) * 72, 148 + (index // 10) * 72), rendered)
    sheet.save(Path(__file__).resolve().parent.parent / "node_modules" / "team-art-preview.png")


if __name__ == "__main__":
    main()
