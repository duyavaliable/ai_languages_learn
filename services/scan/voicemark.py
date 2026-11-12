"""Phân biệt dấu ゛ (dakuten: 2 nét ngắn rời) và ゜ (handakuten: vòng tròn nhỏ có lỗ) bằng HÌNH HỌC
của chính vết mực ở góc trên bên phải ô chữ, không so mẫu font (bản scan mờ: dấu chỉ vài điểm ảnh,
so mẫu cả chữ ば/ぱ chênh nhau < 0.01 điểm).

Bằng chứng, theo thứ tự:
  1. vết dấu có LỖ rõ (>= 12 px và >= 0.5% h²)         -> ゜
  2. hai nét ngắn rời, không lỗ                          -> ゛
  3. một vết liền không lỗ ("blob"): chỉ kết luận ゛ khi CHÍNH ĐỀ NÀY có dấu ゜ đã chắc chắn ở cùng
     cỡ chữ (±20%) — ở cỡ đó ゜ thật luôn hiện lỗ, nên vết không lỗ là hai nét ゛ dính nhau
Không có bằng chứng -> giữ nguyên chữ OCR (không đoán). So mẫu font (glyphcheck.discriminate) KHÔNG
được dùng ở đây: thử trên đề 3 nó đổi sai プレゼント -> ブレゼント.
"""
import numpy as np, cv2

SWAP = {}
for _d, _h in zip('ばびぶべぼバビブベボ', 'ぱぴぷぺぽパピプペポ'):
    SWAP[_d] = _h; SWAP[_h] = _d
HANDAKU = set('ぱぴぷぺぽパピプペポ')


def _ring(m):
    """Vết mực hình VÒNG: tâm trống, mực bao quanh tâm ở >= 10/12 hướng, gần tròn."""
    h, w = m.shape
    if h < 6 or w < 6 or not (0.7 <= w / h <= 1.45):
        return False
    cy, cx = (h - 1) / 2, (w - 1) / 2
    r0 = max(1, int(min(h, w) * 0.18))
    if m[int(round(cy)) - r0:int(round(cy)) + r0 + 1, int(round(cx)) - r0:int(round(cx)) + r0 + 1].any():
        return False
    ys, xs = np.nonzero(m)
    d = np.hypot(ys - cy, xs - cx)
    if d.max() < 2:
        return False
    sect = set((np.floor((np.arctan2(ys - cy, xs - cx) + np.pi) / (2 * np.pi) * 12).astype(int) % 12)[d >= 0.5 * d.max()].tolist())
    return len(sect) >= 10


def mark_geometry(gray, h_line):
    """'handaku' | 'daku' | 'blob' | None"""
    H, W = gray.shape
    if H < 12 or W < 8:
        return None
    zone = gray[:int(0.55 * H), int(0.55 * W):]
    if zone.size == 0:
        return None
    bw = (zone < 175).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    small = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a >= 4 and max(w, h) <= 0.38 * h_line and y + h < zone.shape[0] - 1:
            m = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
            ff = np.pad(m, 1).copy()
            cv2.floodFill(ff, None, (0, 0), 1)
            hole = int((ff == 0).sum())
            if hole < max(12, 0.005 * h_line * h_line) and _ring(m):
                hole = 10 ** 6         # vòng tròn hở 1-2 điểm ảnh (bản scan mờ) vẫn là ゜
            small.append((w, h, a, hole))
    if not small:
        return None
    hole_min = max(12, 0.005 * h_line * h_line)
    holed = [s for s in small if s[3] >= hole_min]
    if len(holed) == 1 and len(small) <= 2:
        return 'handaku'
    if holed:
        return None
    ticks = [s for s in small if s[2] >= 6]
    if len(ticks) == 2 and max(t[2] for t in ticks) <= 2.5 * min(t[2] for t in ticks):
        return 'daku'
    if len(ticks) == 1 and ticks[0][2] >= 0.008 * h_line * h_line and ticks[0][3] < hole_min:
        return 'blob'
    return None


def audit(pages, log):
    """pages: [(rows, gray, ink)] của cả đề. Sửa l['text'] tại chỗ, ghi log."""
    import glyphcheck as g
    cells = []        # (line, k, char, h_line, geo, ink_cell)
    for rows, gray, ink in pages:
        for r in rows:
            for l in r['ls']:
                if l.get('src') == 'text' or not any(c in SWAP for c in l['text']):
                    continue
                x0, y0, x1, y1 = l['box']
                m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
                rr = np.flatnonzero(m.any(axis=1))
                if not len(rr):
                    continue
                m2 = m[rr.min():rr.max() + 1]
                chars = [c for c in l['text'] if not c.isspace()]
                cs = g.align(m2, chars)
                if cs is None:
                    continue
                hl = m2.shape[0]
                for k, ((a, b), c) in enumerate(zip(cs, chars)):
                    if c not in SWAP:
                        continue
                    gcell = gray[max(0, y0) + rr.min():max(0, y0) + rr.max() + 1, max(0, x0) + a:max(0, x0) + b]
                    cells.append((l, k, c, hl, mark_geometry(gcell, hl), m2[:, a:b]))
    sure_h = [hl for _, _, _, hl, geo, _ in cells if geo == 'handaku']
    changes = {}
    for l, k, c, hl, geo, icell in cells:
        kind = geo
        if geo == 'blob':
            kind = 'daku' if sum(abs(h - hl) <= 0.2 * hl for h in sure_h) >= 2 else None
        # KHÔNG dùng so mẫu font làm bằng chứng: trên đề 3 nó đổi sai プレゼント -> ブレゼント
        if kind is None:
            continue
        want = c if (kind == 'handaku') == (c in HANDAKU) else SWAP[c]
        if want != c:
            changes.setdefault(id(l), (l, {}))[1][k] = want
    for l, ch in changes.values():
        out, k = [], 0
        for x in l['text']:
            if x.isspace():
                out.append(x)
            else:
                out.append(ch.get(k, x)); k += 1
        new = ''.join(out)
        log.append(('sửa dấu ゛/゜ bằng hình dạng vết dấu trên ảnh:', l['text'], '->', new))
        l['text'] = new
        l['voice_fixed'] = True
