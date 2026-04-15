"""
WorkMate PWA 아이콘 생성 (Zoom 스타일: 전체 면 파란 그라데이션 + 흰 WM, 넉넉한 여백).
런처가 스쿼클/원형으로 마스크하므로 PNG는 정사각형만 채운다.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
COLOR_TOP = (45, 140, 255)
COLOR_BOTTOM = (30, 110, 220)
TEXT = "WM"
FONT_SIZE = 120


def pick_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\malgunbd.ttf"),
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def make_gradient() -> Image.Image:
    im = Image.new("RGB", (SIZE, SIZE))
    px = im.load()
    for y in range(SIZE):
        t = y / max(SIZE - 1, 1)
        r = int(COLOR_TOP[0] * (1 - t) + COLOR_BOTTOM[0] * t)
        g = int(COLOR_TOP[1] * (1 - t) + COLOR_BOTTOM[1] * t)
        b = int(COLOR_TOP[2] * (1 - t) + COLOR_BOTTOM[2] * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b)
    return im


def draw_centered_text(im: Image.Image, text: str, font: ImageFont.ImageFont) -> None:
    draw = ImageDraw.Draw(im)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (SIZE - tw) // 2 - bbox[0]
    y = (SIZE - th) // 2 - bbox[1] - 4
    draw.text((x, y), text, font=font, fill=(255, 255, 255))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out512 = root / "icons" / "icon-512.png"
    out192 = root / "icons" / "icon-192.png"

    im = make_gradient()
    font = pick_font(FONT_SIZE)
    draw_centered_text(im, TEXT, font)

    im.save(out512, "PNG")
    im.resize((192, 192), Image.Resampling.LANCZOS).save(out192, "PNG")
    print("wrote", out512, out192)


if __name__ == "__main__":
    main()
