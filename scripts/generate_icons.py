"""Generates the 16x16 pixel icons in public/assets/icons used instead of emoji.

Run with: python scripts/generate_icons.py
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "icons"

PALETTE = {
    ".": (0, 0, 0, 0),
    "k": (38, 32, 42, 255),     # outline
    "w": (245, 245, 240, 255),  # white
    "g": (150, 156, 168, 255),  # light steel
    "s": (98, 104, 118, 255),   # dark steel
    "b": (133, 88, 52, 255),    # wood
    "d": (92, 58, 33, 255),     # dark wood
    "y": (247, 197, 62, 255),   # gold
    "o": (214, 140, 34, 255),   # dark gold
    "r": (214, 64, 58, 255),    # red
    "m": (150, 36, 44, 255),    # dark red
    "c": (84, 205, 225, 255),   # cyan
    "t": (36, 134, 158, 255),   # dark cyan
    "e": (86, 186, 92, 255),    # green
    "n": (52, 54, 66, 255),     # screen
    "p": (235, 188, 150, 255),  # skin
    "a": (66, 96, 200, 255),    # blue
}

ICONS = {
    # Commander: gold crown over a red banner
    "role_commander": [
        "................",
        "..k....kk....k..",
        ".kyk..kyyk..kyk.",
        ".kyyk.kyyk.kyyk.",
        ".kyyykyyyykyyyk.",
        ".kyyyyyrryyyyyk.",
        ".kyyyyrrrryyyyk.",
        ".kooooooooooook.",
        "..kkkkkkkkkkkk..",
        "...krrrrrrrrk...",
        "...krrrrrrrrk...",
        "...krmrrrrmrk...",
        "...krrrrrrrrk...",
        "...krrkkkkrrk...",
        "...krk....krk...",
        "...kk......kk...",
    ],
    # Coder: terminal window with a prompt
    "role_coder": [
        "................",
        ".kkkkkkkkkkkkkk.",
        ".kggggggggggrek.",
        ".kkkkkkkkkkkkkk.",
        ".knnnnnnnnnnnnk.",
        ".kncnnnnnnnnnnk.",
        ".knnccnnnnnnnnk.",
        ".knnnnccnnnnnnk.",
        ".knnccnnnnnnnnk.",
        ".kncnnnnnwwwwnk.",
        ".knnnnnnnnnnnnk.",
        ".kkkkkkkkkkkkkk.",
        "......kggk......",
        "....kkkkkkkk....",
        "....kggggggk....",
        "....kkkkkkkk....",
    ],
    # Builder: hammer resting on bricks
    "role_builder": [
        "................",
        "...kkkkkkkk.....",
        "..kgggggggsk....",
        "..kgggggggsk....",
        "...kkkkbdkkk....",
        "......kbdk......",
        "......kbdk......",
        "......kbdk......",
        "kkkkkkkbdkkkkkk.",
        "krrrkmrrrkmrrrk.",
        "kmmmkmmmmkmmmmk.",
        "kkkkkkkkkkkkkkk.",
        "krrkmrrrkmrrrkk.",
        "kmmkmmmmkmmmmkk.",
        "kkkkkkkkkkkkkkk.",
        "................",
    ],
    # Miner: pickaxe
    "role_miner": [
        "................",
        "...kkkkkkk......",
        "..kcccccccckk...",
        ".kccttttttccck..",
        ".kctk...kkbdtck.",
        "..kk...kbdk.ktk.",
        "......kbdk..ktk.",
        ".....kbdk...kck.",
        "....kbdk....kck.",
        "...kbdk.....kk..",
        "..kbdk..........",
        ".kbdk...........",
        ".kdk............",
        "..k.............",
        "................",
        "................",
    ],
    # Defender: shield
    "role_defender": [
        "................",
        ".kkkkkkkkkkkkkk.",
        ".kaaaaaaggaaaak.",
        ".kaaaaaaggaaaak.",
        ".kaaaaaaggaaaak.",
        ".kaaaaaaggaaaak.",
        ".kggggggggggggk.",
        ".kggggggggggggk.",
        ".kaaaaaaggaaaak.",
        "..kaaaaaggaaak..",
        "..kaaaaaggaaak..",
        "...kaaaaggaak...",
        "....kaaaggak....",
        ".....kaaggk.....",
        "......kkkk......",
        "................",
    ],
    # Explorer: compass
    "role_explorer": [
        "................",
        ".....kkkkkk.....",
        "...kkyyyyyykk...",
        "..kyywwwwwwyyk..",
        "..kywwwwwwrwyk..",
        ".kywwwwwwrrwwyk.",
        ".kywwwwwrrrwwyk.",
        ".kywwwwwkrwwwyk.",
        ".kywwwskwwwwwyk.",
        ".kywwsssswwwwyk.",
        ".kywwssswwwwwyk.",
        "..kywswwwwwwyk..",
        "..kyywwwwwwyyk..",
        "...kkyyyyyykk...",
        ".....kkkkkk.....",
        "................",
    ],
    # Goal: archery target with a hit in the centre
    "goal": [
        "................",
        ".....kkkkkk.....",
        "...kkrrrrrrkk...",
        "..krrwwwwwwrrk..",
        "..krwwrrrrwwrk..",
        ".krwwrrrrrrwwrk.",
        ".krwrrwwwwrrwrk.",
        ".krwrrwyywrrwrk.",
        ".krwrrwyywrrwrk.",
        ".krwrrwwwwrrwrk.",
        ".krwwrrrrrrwwrk.",
        "..krwwrrrrwwrk..",
        "..krrwwwwwwrrk..",
        "...kkrrrrrrkk...",
        ".....kkkkkk.....",
        "................",
    ],
    # Assignee: blocky head and shoulders
    "person": [
        "................",
        "....kkkkkkkk....",
        "....kddddddk....",
        "....kddddddk....",
        "....kppppppk....",
        "....kpkppkpk....",
        "....kppppppk....",
        "....kppppppk....",
        ".....kkkkkk.....",
        "...kkaaaaaakk...",
        "..kaaaaaaaaaak..",
        "..kaaaaaaaaaak..",
        "..kaakaaaakaak..",
        "..kaakaaaakaak..",
        "..kkkkkkkkkkkk..",
        "................",
    ],
    # Decision podium: a gold bell on a wooden stand
    "podium": [
        "................",
        ".......kk.......",
        "......kyyk......",
        ".....kyyyyk.....",
        ".....kyyyok.....",
        "....kyyyyyok....",
        "....kyyyyyok....",
        "...kyyyyyyyok...",
        "...kkkkkkkkkk...",
        "......krrk......",
        "......kbdk......",
        "......kbdk......",
        "......kbdk......",
        "...kkkkbdkkkk...",
        "...kbbbbbbbdk...",
        "...kkkkkkkkkk...",
    ],
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in ICONS.items():
        image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        for y, row in enumerate(rows):
            if len(row) != 16:
                raise ValueError(f"{name} row {y} has {len(row)} columns")
            for x, key in enumerate(row):
                image.putpixel((x, y), PALETTE[key])
        image.save(OUT / f"{name}.png")
    print(f"Wrote {len(ICONS)} icons to {OUT}")


if __name__ == "__main__":
    main()
