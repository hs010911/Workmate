"""
앱 아이콘에서 로고(WM)만 시각적으로 축소해 Zoom처럼 여백을 늘린다.
- 배경(파란 그라데이션)은 512 전체를 채움
- 전경은 '파란 배경이 아닌' 픽셀(흰 글자·그림자·에지)만 알파로 올린 뒤 비율 축소 후 중앙 합성
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def is_blue_background(rgb: np.ndarray) -> np.ndarray:
    """흰 글자·밝은 반사는 제외하고, 지배적으로 파란 픽셀을 배경으로 본다."""
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    return (b >= r + 10) & (b >= g + 6) & (r < 245)


def make_vertical_gradient_bg(a: np.ndarray, h: int, w: int) -> Image.Image:
    c0 = a[min(48, h // 6), min(48, w // 6), :3].astype(np.float32)
    c1 = a[max(0, h - 49), max(0, w - 49), :3].astype(np.float32)
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    row = (1.0 - ys) * c0 + ys * c1
    out = np.broadcast_to(row, (h, w, 3)).astype(np.uint8)
    return Image.fromarray(out).convert("RGBA")


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\hanse\Desktop\cap\icons\icon-512.png"
    scale = float(sys.argv[2]) if len(sys.argv) > 2 else 0.76
    out512 = r"c:\Users\hanse\Desktop\cap\icons\icon-512.png"
    out192 = r"c:\Users\hanse\Desktop\cap\icons\icon-192.png"

    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    rgb = a[:, :, :3]
    h, w = rgb.shape[:2]

    bg_mask = is_blue_background(rgb)
    fg = ~bg_mask

    fg = ndimage.binary_dilation(fg, iterations=2)
    fg = ndimage.binary_opening(fg, iterations=1)

    alpha = (fg.astype(np.uint8) * 255)
    rgba = np.dstack([rgb, alpha])
    fg_img = Image.fromarray(rgba)

    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    fg_small = fg_img.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(fg_small, ((w - nw) // 2, (h - nh) // 2), fg_small)

    bg_img = make_vertical_gradient_bg(rgb, h, w)
    out = Image.alpha_composite(bg_img, canvas)

    out.resize((512, 512), Image.Resampling.LANCZOS).save(out512, "PNG")
    out.resize((192, 192), Image.Resampling.LANCZOS).save(out192, "PNG")
    print("OK scale=", scale, "->", out512, out192)


if __name__ == "__main__":
    main()
