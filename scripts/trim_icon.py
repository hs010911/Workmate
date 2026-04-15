"""
PWA 아이콘: 배경(회색/밝은 여백) 제거 후 정사각형으로 리사이즈.
모서리에서 BFS로 연결된 배경만 제거해 파란 스쿼클+WM이 꽉 차게 만든다.
"""
from __future__ import annotations

import sys
from collections import deque

import numpy as np
from PIL import Image


def flood_background_mask(rgb: np.ndarray, tol: float = 42.0) -> np.ndarray:
    """(0,0)과 색이 비슷하고 연결된 영역을 배경으로 마킹."""
    h, w = rgb.shape[:2]
    start = rgb[0, 0].astype(np.float32)
    bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque([(0, 0)])

    while q:
        y, x = q.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        if np.linalg.norm(rgb[y, x].astype(np.float32) - start) > tol:
            continue
        bg[y, x] = True
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                q.append((ny, nx))
    return bg


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\hanse\Desktop\cap\icons\icon-512.png"
    out512 = r"c:\Users\hanse\Desktop\cap\icons\icon-512.png"
    out192 = r"c:\Users\hanse\Desktop\cap\icons\icon-192.png"

    im = Image.open(src).convert("RGBA")
    a = np.array(im)
    rgb = a[:, :, :3]

    bg = flood_background_mask(rgb, tol=42.0)
    fg = ~bg

    ys, xs = np.where(fg)
    if ys.size == 0:
        raise SystemExit("foreground empty")

    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))

    cw, ch = crop.size
    side = min(cw, ch)
    l = (cw - side) // 2
    t = (ch - side) // 2
    crop = crop.crop((l, t, l + side, t + side))

    crop.resize((512, 512), Image.Resampling.LANCZOS).save(out512, "PNG")
    crop.resize((192, 192), Image.Resampling.LANCZOS).save(out192, "PNG")
    print("saved", out512, out192, "from square", side)


if __name__ == "__main__":
    main()
