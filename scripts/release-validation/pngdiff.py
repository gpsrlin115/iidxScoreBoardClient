# Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) and pixel diff with a bounding box.
import zlib, struct, sys
def decode(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w = 8, b'', None
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos+8]); body = data[pos+8:pos+8+ln]; pos += 12 + ln
        if typ == b'IHDR': w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', body); assert bd == 8 and il == 0 and ct in (2, 6)
        elif typ == b'IDAT': idat += body
    bpp = 4 if ct == 6 else 3
    raw = zlib.decompress(idat); stride = w * bpp; out = bytearray(); prev = bytearray(stride); i = 0
    for _ in range(h):
        f = raw[i]; line = bytearray(raw[i+1:i+1+stride]); i += 1 + stride
        for x in range(stride):
            a = line[x-bpp] if x >= bpp else 0; b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line; prev = line
    return w, h, bpp, out
def diff(p1, p2, tol=24):
    w1, h1, b1, d1 = decode(p1); w2, h2, b2, d2 = decode(p2)
    if (w1, h1) != (w2, h2): return f'size {w1}x{h1} vs {w2}x{h2}'
    n = 0; x0 = y0 = 10**9; x1 = y1 = -1
    for y in range(h1):
        for x in range(w1):
            i, j = (y*w1+x)*b1, (y*w1+x)*b2
            if max(abs(d1[i]-d2[j]), abs(d1[i+1]-d2[j+1]), abs(d1[i+2]-d2[j+2])) > tol:
                n += 1; x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    return f'{n} px differ ({n/(w1*h1):.4%})' + (f' bbox=({x0},{y0})-({x1},{y1})' if n else '')
if __name__ == '__main__':
    for a, b in zip(sys.argv[1::2], sys.argv[2::2]): print(a.split('/')[-1], 'vs', b.split('/')[-1], ':', diff(a, b))
