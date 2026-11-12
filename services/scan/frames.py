"""Nhận khung vuông rỗng cỡ một dòng chữ (khung số câu: |1|, [26]...)."""
import cv2, numpy as np


def _side_cover(sub, b):
    """Tỉ lệ phủ mực của từng cạnh (dải dày b px): trên, dưới, trái, phải."""
    return (sub[:b].max(axis=0).mean(), sub[-b:].max(axis=0).mean(),
            sub[:, :b].max(axis=1).mean(), sub[:, -b:].max(axis=1).mean())


def find_frames(ink):
    """Khung thật: to hơn một chữ, cả 4 cạnh là đường THẲNG gần liền nét (mỗi cạnh phủ >= 85%),
    bên trong gần như trống. Chữ có nét bao kín (B, D, O, 口, 日) nhỏ hơn và có cạnh cong / hở."""
    ink = ink.astype(np.uint8)
    gh = glyph_height(ink)
    cnts, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if not (1.2 * gh <= h <= 3.0 * gh and 0.7 <= w / h <= 1.8):
            continue
        sub = ink[y:y + h, x:x + w]
        b = 4
        if min(_side_cover(sub, b)) < 0.85:
            continue
        inner = sub[2 * b:-2 * b, 2 * b:-2 * b]
        if inner.size and 0.02 < inner.mean() < 0.4:
            if not any(abs(x - f[0]) < 6 and abs(y - f[1]) < 6 for f in out):
                out.append((int(x), int(y), int(x + w), int(y + h)))
    return out


def erase_frames(img, frames, t=7):
    """Xoá 4 cạnh khung. Bề dày xoá theo cỡ khung (viền in đậm / nhoè dày hơn 7px vẫn bị xoá hết),
    chữ số bên trong nằm giữa khung nên không bị chạm. Nới thêm 3px ra ngoài cho phần nhoè ở mép."""
    H, W = img.shape[:2]
    for x0, y0, x1, y1 in frames:
        tt = max(t, int(0.13 * min(x1 - x0, y1 - y0)))
        X0, Y0, X1, Y1 = max(0, x0 - 3), max(0, y0 - 3), min(W, x1 + 3), min(H, y1 + 3)
        img[Y0:y0 + tt, X0:X1] = 255; img[y1 - tt:Y1, X0:X1] = 255
        img[Y0:Y1, X0:x0 + tt] = 255; img[Y0:Y1, x1 - tt:X1] = 255


def glyph_height(ink):
    """Chiều cao chữ điển hình: phân vị 80 chiều cao các cụm mực cỡ chữ (~ chữ nguyên khối)."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8))
    hs = [st[i][3] for i in range(1, n) if 15 <= st[i][3] <= 150 and st[i][4] >= 30]
    return float(np.percentile(hs, 80)) if hs else 50.0


def line_mask(ink, gh):
    """Mặt nạ ĐƯỜNG KẺ cần xoá trước OCR (khung, kẻ bảng, gạch chân).
    Nét ngang ngắn (< 3 cỡ chữ) có thể là nét CHỮ (一, ー, nét dưới của 二) hoặc GẠCH CHÂN. Phân biệt bằng
    độ cao so với chữ cùng hàng: gạch chân nằm THẤP HƠN chân mọi chữ xung quanh; nét ngang của chữ thì
    các chữ bên cạnh thò xuống ngang hoặc thấp hơn nó."""
    m = ink.astype(np.uint8)
    H, W = m.shape
    lh = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((1, max(3, int(1.2 * gh))), np.uint8))
    lv = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((max(3, int(2.5 * gh)), 1), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(lh)
    other = (m > 0) & (lh == 0)                      # mực không thuộc nét ngang dài
    keep_h = np.zeros_like(lh)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if w >= 3.0 * gh:
            keep_h[lab == i] = 1                     # đường kẻ dài: luôn xoá
            continue
        # chữ của cùng hàng: mực trong khoảng 1.2 cỡ chữ phía trên, rộng ra 1.5 cỡ chữ hai bên
        X0, X1 = max(0, int(x - 1.5 * gh)), min(W, int(x + w + 1.5 * gh))
        Y0 = max(0, int(y - 1.2 * gh))
        reg = other[Y0:min(H, y + h + int(0.05 * gh) + 1), X0:X1].copy()
        # bỏ viền nhoè của CHÍNH nét này (điểm mép không qua được phép mở hình thái)
        reg[max(0, y - 3 - Y0):, max(0, x - 3 - X0):x + w + 3 - X0] = False
        cols = np.flatnonzero(reg.any(axis=0))
        if len(cols) < 0.15 * gh:
            continue                                 # không có chữ nào cạnh nó: không đoán, giữ
        # với mỗi cột có chữ: điểm mực thấp nhất (xét tới ngang mức của nét, không quá)
        low = np.array([np.flatnonzero(reg[:, c]).max() for c in cols]) + Y0
        # khoảng hở giữa chân chữ (10% cột thấp nhất) và mép trên của nét, tính theo cỡ chữ.
        # Đo trên 7 đề: gạch chân thật >= 0.08; nét đáy của chữ (上, 二, 一) <= 0.0.
        gap = (y - np.percentile(low, 90)) / gh
        if gap >= 0.06:
            keep_h[lab == i] = 1                     # nằm hẳn dưới chân chữ -> gạch chân -> xoá
    return (keep_h | lv) > 0


def ink_mask(img):
    """Mặt nạ MỰC hai ngưỡng (dùng chung cho mọi bước: làm sạch trước OCR, so ảnh, gạch chân).
    - chắc chắn là mực: điểm tối (V < 160) hoặc màu rất đậm (chữ xanh/đỏ tươi)
    - điểm xám vừa (V < 215) chỉ là mực khi NỐI LIỀN với điểm tối, trong một cụm cỡ chữ: nét mảnh
      khử răng cưa (一, nét ngang của 二 三, dấu ゛) phần lớn là điểm xám, ngưỡng 160 làm mất nét.
      Chữ nền / logo in mờ không có điểm tối nào nên vẫn bị loại; vùng tô xám lớn của hình vẽ chỉ
      giữ phần sát nét tối."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    strong = (hsv[..., 2] < 160) | ((hsv[..., 1] >= 200) & (hsv[..., 2] >= 80))
    weak = (hsv[..., 2] < 215) | strong
    W = img.shape[1]
    cap = 2500 * (W / 2800.0) ** 2                      # diện tích tối đa của một cụm nét cỡ chữ
    n, lab, st, _ = cv2.connectedComponentsWithStats(weak.astype(np.uint8), connectivity=8)
    has_strong = np.zeros(n, bool)
    has_strong[np.unique(lab[strong])] = True
    small = st[:, cv2.CC_STAT_AREA] <= cap
    keep_comp = has_strong & small
    keep_comp[0] = False
    out = keep_comp[lab] | strong
    # cụm lớn (hình vẽ, vùng tô): chỉ thêm điểm xám sát nét tối như trước
    near = cv2.dilate(strong.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    out |= weak & near & ~small[lab]
    return out.astype(np.uint8)
