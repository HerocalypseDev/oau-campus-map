"""Draw the app icon (blue square with a white map pin) as PNG files. No extra libraries needed."""
import math, struct, zlib, sys, os

def pin_alpha(x, y):
    # Pin shape in unit coordinates (0..1). Head circle + point at bottom. Kept inside the
    # centre 60% so Android "maskable" icon cropping does not cut it.
    cx, cy, r = 0.5, 0.42, 0.17
    tip = 0.76
    d = math.hypot(x - cx, y - cy)
    inside = d <= r
    if not inside and cy <= y <= tip:
        # Triangle from the circle's tangent points down to the tip.
        half = r * (tip - y) / (tip - cy)
        inside = abs(x - cx) <= half
    hole = math.hypot(x - cx, y - cy) <= r * 0.42
    return inside and not hole

def make(size, path):
    bg = (29, 78, 216)
    ss = 3  # supersampling for smooth edges
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = sum(pin_alpha((px + (i + .5) / ss) / size, (py + (j + .5) / ss) / size)
                       for i in range(ss) for j in range(ss))
            a = hits / (ss * ss)
            row += bytes(round(bg[k] * (1 - a) + 255 * a) for k in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    open(path, "wb").write(png)

out = sys.argv[1] if len(sys.argv) > 1 else "icons"
for s in (192, 512):
    make(s, os.path.join(out, f"icon-{s}.png"))
print("done")
