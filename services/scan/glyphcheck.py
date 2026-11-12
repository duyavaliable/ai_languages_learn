"""Hybrid cho ảnh scan: XÁC MINH chữ bằng cách VẼ LẠI rồi so với ảnh gốc (không dùng AI).

Với một ô chữ PaddleOCR không chắc, lấy vài khả năng (chữ OCR đọc + chữ hay nhầm với nó),
vẽ từng khả năng bằng nhiều font tiếng Nhật, đưa về cùng khung rồi so hình dạng với ô chữ trên ảnh.
Nhận khi khả năng tốt nhất thắng RÕ RÀNG (cách biệt >= MARGIN); không thì giữ nguyên (hiện ảnh gốc).
"""
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

FONTS = ['YuGothM.ttc', 'YuGothB.ttc', 'msgothic.ttc', 'meiryo.ttc', 'BIZ-UDGothicR.ttc', 'BIZ-UDMinchoM.ttc',
         'msmincho.ttc', 'UDDigiKyokashoN-R.ttc', 'arial.ttf', 'times.ttf', 'calibri.ttf']
LATIN_FONTS = {'arial.ttf', 'times.ttf', 'calibri.ttf'}
_fc = {}
N = 48
MARGIN = 0.06


def _font(name, size):
    k = (name, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype('C:/Windows/Fonts/' + name, size)
    return _fc[k]


def _norm(mask):
    """Cắt sát phần mực, đặt vào khung N x N giữ tỉ lệ, đặt giữa. Trả về (ảnh, tỉ lệ rộng/cao)."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None, 0
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    h, w = m.shape
    s = (N - 4) / max(h, w)
    m = cv2.resize(m, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    out = np.zeros((N, N), np.uint8)
    y0 = (N - m.shape[0]) // 2; x0 = (N - m.shape[1]) // 2
    out[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] = m
    return out > 80, w / h


_rc = {}


def _render(ch, font):
    k = (ch, font)
    if k not in _rc:
        f = _font(font, 96)
        img = Image.new('L', (200, 200), 0)
        ImageDraw.Draw(img).text((20, 20), ch, fill=255, font=f)
        _rc[k] = np.array(img) > 100
    return _rc[k]


def _dt(a):
    return cv2.distanceTransform((~a).astype(np.uint8), cv2.DIST_L2, 3)


def _sim(a, b, da=None, db=None):
    """Độ giống hình dạng: trung bình 2 chiều của tỉ lệ điểm mực nằm gần mực bên kia (chamfer)."""
    da = _dt(a) if da is None else da
    db = _dt(b) if db is None else db
    s1 = (db[a] <= 1.5).mean() if a.any() else 0
    s2 = (da[b] <= 1.5).mean() if b.any() else 0
    return (s1 + s2) / 2


_nc = {}


def _cand(c, f, ref='国'):
    """Bản vẽ đã chuẩn hoá của một khả năng (lưu đệm):
    (ảnh, tỉ lệ rộng/cao, distance map, chiều cao so với chữ thước đo `ref` vẽ cùng font)."""
    k = (c, f, ref)
    if k not in _nc:
        try:
            raw = _render(c, f)
        except OSError:
            _nc[k] = None; return None
        b, rb = _norm(raw)
        _nc[k] = None if b is None else (b, rb, _dt(b), _height(raw) / max(1, _height(_render(ref, f))))
    return _nc[k]


def _height(mask):
    ys = np.flatnonzero(mask.any(axis=1))
    return (ys.max() - ys.min() + 1) if len(ys) else 0


def score(cell_mask, cands, rel=None, ref='国'):
    """Điểm từng khả năng = điểm tốt nhất trên các font.
    Phạt khi tỉ lệ rộng/cao lệch, và (nếu biết) khi CHIỀU CAO so với kanji của dòng lệch:
    rel = chiều cao ô chữ / chiều cao kanji trong dòng (H Latin ~0.7, 日 ~0.9)."""
    a, ra = _norm(cell_mask)
    if a is None:
        return {}
    da = _dt(a)
    out, shape = {}, {}
    for c in cands:
        best = bshape = 0
        for f in FONTS:
            if f in LATIN_FONTS and not (c.isascii() and ref.isascii()):
                continue          # font Latin không có chữ Nhật (vẽ ra ô vuông thay thế)
            cd = _cand(c, f, ref)
            if cd is None:
                continue
            b, rb, db, rc = cd
            pen = min(ra, rb) / max(ra, rb)          # 1 = cùng tỉ lệ
            s = _sim(a, b, da, db) * (0.7 + 0.3 * pen)
            bshape = max(bshape, s)
            if rel is not None:                       # chiều cao: chỉ để phân thắng thua, cho sai lệch 0.08
                s *= max(0.0, 1 - 1.2 * max(0.0, abs(rc - rel) - 0.08))
            best = max(best, s)
        out[c] = round(float(best), 3)
        shape[c] = round(float(bshape), 3)
    score.shape = shape                               # điểm hình dạng thuần (để so với ngưỡng OWN_MIN)
    return out


_nc64 = {}


def _norm64(mask):
    global N
    keep = N; N = 64
    try:
        return _norm(mask)
    finally:
        N = keep


def _cand64(c, f):
    k = (c, f)
    if k not in _nc64:
        try:
            b, rb = _norm64(_render(c, f))
        except OSError:
            b = None
        _nc64[k] = None if b is None else (b, rb, _dt(b), 0)
    return _nc64[k]


def discriminate(cell_mask, c1, c2):
    """Hai chữ sát điểm nhau (天/犬, 末/未, か/が): chỉ so PHẦN NÉT KHÁC NHAU giữa hai chữ,
    ở độ phân giải cao hơn (64px) để thấy chi tiết nhỏ (dấu chấm, nét ngắn).
    Trả về chữ thắng nếu mọi font khớp nhất cùng chỉ ra một chữ, không thì None."""
    a, _ = _norm64(cell_mask)
    if a is None:
        return None
    da = _dt(a)
    _cand_saved = _cand
    globals()['_cand'] = lambda c, f, ref='国': _cand64(c, f)
    try:
        return _discriminate(a, da, c1, c2)
    finally:
        globals()['_cand'] = _cand_saved


def _discriminate(a, da, c1, c2):
    votes = {c1: 0, c2: 0}
    nf = 0
    # chỉ dùng các font GIỐNG font của đề nhất (khớp tốt nhất với ô chữ): phần nét khác nhau
    # thay đổi theo font (Mincho có chân nét), font lạ cho kết quả nhiễu
    fit = {}
    for f in FONTS:
        if f in LATIN_FONTS and not (c1.isascii() and c2.isascii()):
            continue
        x, y = _cand(c1, f), _cand(c2, f)
        if x is None or y is None:
            continue
        fit[f] = max(_sim(a, x[0], da, x[2]), _sim(a, y[0], da, y[2]))
    if not fit:
        return None
    top = max(fit.values())
    for f in [f for f in fit if fit[f] >= top - 0.03]:
        x, y = _cand(c1, f), _cand(c2, f)
        b1, _, d1, _ = x; b2, _, d2, _ = y
        only1 = b1 & (d2 > 2.0)            # nét chỉ chữ 1 có (xa mọi nét của chữ 2)
        only2 = b2 & (d1 > 2.0)
        if only1.sum() < 8 and only2.sum() < 8:
            continue
        nf += 1
        # nét riêng của chữ nào có mực ảnh gốc nằm trên -> chữ đó
        h1 = (da[only1] <= 1.5).mean() if only1.sum() >= 8 else None
        h2 = (da[only2] <= 1.5).mean() if only2.sum() >= 8 else None
        s1 = h1 if h1 is not None else 1 - (h2 or 0)
        s2 = h2 if h2 is not None else 1 - (h1 or 0)
        if s1 - s2 >= 0.3: votes[c1] += 1
        elif s2 - s1 >= 0.3: votes[c2] += 1
    if nf >= 1:
        for c, o in ((c1, c2), (c2, c1)):
            if votes[c] == nf and votes[o] == 0:     # mọi font khớp nhất đều chỉ cùng một chữ
                return c
    return None


SIZE_TWINS = ['。○o', '・●', 'っつ', 'ゃや', 'ゅゆ', 'ょよ', 'ぁあ', 'ぃい', 'ぅう', 'ぇえ', 'ぉお', 'ゎわ', 'ゕか',
              'ッツ', 'ャヤ', 'ュユ', 'ョヨ', 'ァア', 'ィイ', 'ゥウ', 'ェエ', 'ォオ', 'cC', 'oO', 'sS', 'vV', 'wW',
              'xX', 'zZ', 'uU', 'pP', 'kK']


def decide(cell_mask, cands, rel=None):
    sc = score(cell_mask, cands, rel)
    if not sc:
        return None, sc
    r = sorted(sc.items(), key=lambda kv: -kv[1])
    if len(r) == 1 or r[0][1] - r[1][1] >= MARGIN:
        return r[0][0], sc
    return None, sc


def pieces_of(mask):
    """Các mảnh mực liền theo chiều ngang (chưa gộp)."""
    col = mask.any(axis=0)
    out, x, W = [], 0, len(col)
    while x < W:
        if col[x]:
            s = x
            while x < W and col[x]: x += 1
            out.append([s, x])
        x += 1
    return out


def _expw(c, h):
    """Bề rộng mực dự kiến của một ký tự, theo loại chữ."""
    if c in '.,、。・:;\'"`':
        return 0.2 * h
    if c in '()（）「」『』[]〔〕!！|｜':
        return 0.3 * h
    if c in '1１lIi':
        return 0.25 * h            # số 1 / chữ mảnh: mực chỉ là một nét dọc
    if ord(c) < 0x2E80 or c in 'ー~～':
        return 0.55 * h
    return 0.85 * h


# chữ gồm hai nét đứng tách hẳn nhau (い り け ハ ル 川 八 小): khoảng hở bên trong chữ lớn hơn bình thường
SPLIT_OK = set('いりけにハルリ川八小')


def align(mask, chars):
    """Ghép mảnh mực với từng ký tự theo bề rộng dự kiến (quy hoạch động).
    Mỗi ký tự nhận 1..6 mảnh liền nhau. Trả về [(x0, x1)] cho từng ký tự, hoặc None nếu không khớp."""
    h = mask.shape[0]
    P = pieces_of(mask)
    n, m = len(P), len(chars)
    if n < m or m == 0:
        return None
    INF = 1e9
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    bk = [[0] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0
    for i in range(1, n + 1):
        for j in range(1, min(i, m) + 1):
            for k in range(max(j - 1, i - 6), i):          # ký tự j = mảnh k..i-1 (bản scan làm chữ vỡ nhiều mảnh)
                if dp[k][j - 1] >= INF:
                    continue
                w = P[i - 1][1] - P[k][0]
                gaps = max([P[t + 1][0] - P[t][1] for t in range(k, i - 1)] or [0])
                cost = abs(w - _expw(chars[j - 1], h)) / h + (2.0 if gaps > (0.6 if chars[j - 1] in SPLIT_OK else 0.3) * h else 0)
                if dp[k][j - 1] + cost < dp[i][j]:
                    dp[i][j] = dp[k][j - 1] + cost; bk[i][j] = k
    align.cost = dp[n][m] / m if dp[n][m] < INF else INF
    if dp[n][m] >= INF or dp[n][m] / m > 0.35:
        return None
    out, i = [], n
    for j in range(m, 0, -1):
        k = bk[i][j]; out.append((P[k][0], P[i - 1][1])); i = k
    return out[::-1]


def cells(mask, h):
    """Tách một dòng chữ thành từng ô chữ theo khoảng trắng dọc, gộp các nét rời của cùng một chữ."""
    col = mask.any(axis=0)
    pieces, x = [], 0
    W = len(col)
    while x < W:
        if col[x]:
            s = x
            while x < W and col[x]: x += 1
            pieces.append([s, x])
        x += 1
    out = []
    for p in pieces:     # gộp mảnh khi tổng bề rộng vẫn <= 1 chữ (い, に, ハ có nét rời)
        if out and p[1] - out[-1][0] <= 1.05 * h and (p[0] - out[-1][1]) < 0.25 * h:
            out[-1][1] = p[1]
        else:
            out.append(p)
    return out


# ------------------------------------------------------------------ nhóm chữ hay nhầm
import json as _json, os as _os, re as _re

_BASE_GROUPS = [
    # dấu ゛゜, chữ nhỏ/chữ to (hiragana; katakana sinh tự động bên dưới)
    'かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'ちぢ', 'つづっ', 'てで',
    'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ', 'やゃ', 'ゆゅ', 'よょ', 'あぁ', 'いぃ', 'うぅ', 'えぇ', 'おぉ',
    # hình dạng gần giống
    'へ~～ーく', 'のめぬ', 'にこけた', 'をそ', 'とこ', 'はほま', 'われね', 'るろ', 'さち', 'りい', 'しつ', 'ソンシツ',
    'ーー一-', '口ロ□', '・•·', '力カ', '工エ', '二ニ', '八ハ', '夕タ', '卜ト',
    # kanji / Latin dễ nhầm
    '日H目白曰月', '書昔', '土士十', '末未', '人入八', '千干', '己已巳', '待持侍', '問間', '休体', '大犬太', '午牛',
    '天夫', '本木', '使便', '読続', '来米', '買貝', '長帳', '住往', '作昨', '教数', '会合', '気气', '毎海梅', '朝期潮',
    '0OoD', '1lI|', '5S', '8B', 'rn',
]


def _kata(s):
    return ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)


def load_groups():
    gs = list(_BASE_GROUPS) + [_kata(g) for g in _BASE_GROUPS if all('ぁ' <= c <= 'ゖ' for c in g)]
    p = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'confusions.json')
    if _os.path.exists(p):                      # tầng 4: các cặp nhầm học từ lần admin sửa
        gs += _json.load(open(p, encoding='utf8'))
    return gs


GROUPS = load_groups()


def group_of(ch):
    s = set()
    for g in GROUPS:
        if ch in g:
            s |= set(g)
    s.discard(ch)
    return sorted(s)


FAILS = []
KANJI_RE = _re.compile(r'[一-鿿]')
HIRA = [chr(c) for c in range(0x3041, 0x3097)]
KATA = [chr(c) for c in range(0x30A1, 0x30FB)] + ['ー']
ASCII = [chr(c) for c in range(0x21, 0x7F)]
PUNCT = list('、。・「」『』（）〔〕！？：；…～ー〜★☆○●◎△▲□■※＊－•·')
_np = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'kanji_neighbors.json')
NEIGHBORS = _json.load(open(_np, encoding='utf8')) if _os.path.exists(_np) else {}


def rivals(c):
    """Tập đối thủ để XÁC NHẬN một chữ: mọi chữ cùng loại + nhóm hay nhầm.
    None = không có tập đối thủ đủ đầy (kanji ngoài nhóm, chữ có dấu tiếng Việt) -> không xác nhận được."""
    g = group_of(c)
    if 'ぁ' <= c <= 'ゖ':
        pool = HIRA + KATA                  # gồm cả katakana: へ/ヘ, り/リ giống nhau -> sẽ không thắng rõ
    elif 'ァ' <= c <= 'ヺ' or c == 'ー':
        pool = KATA + HIRA
    elif '\x21' <= c <= '\x7e':
        pool = ASCII
    elif c in PUNCT:
        pool = PUNCT + ASCII
    elif KANJI_RE.match(c) and (c in NEIGHBORS or g):
        pool = list(NEIGHBORS.get(c, ''))      # 12 kanji trông giống nhất (bảng tự tạo) + nhóm hay nhầm
    elif g:
        pool = []
    else:
        return None
    twin = {t for p in TWINS if c in p for t in p}     # cặp giống hệt khác hệ chữ: không so hình được
    import unicodedata
    twin |= {t for t in pool + g if unicodedata.normalize('NFKC', t) == unicodedata.normalize('NFKC', c)}  # ( và （
    return sorted(set(pool + g) - {c} - twin)


JA_RE = _re.compile(r'[぀-ヿ一-鿿]')


def kind(c):
    if 'ぁ' <= c <= 'ゖ': return 'hira'
    if 'ァ' <= c <= 'ヺ' or c == 'ー': return 'kata'
    if KANJI_RE.match(c): return 'kanji'
    if c.isdigit(): return 'digit'
    if c.isascii() and c.isalpha(): return 'latin'
    return 'sym'


# hiragana / katakana gần như CÙNG HÌNH: hình dạng không phân biệt được, hệ chữ lấy theo chữ OCR đọc
TWINS = ['へヘ', 'べベ', 'ぺペ', 'りリ']
OWN_MIN = 0.88


def restore_line(line, ink):
    """Kiểm tra + khôi phục một dòng OCR bằng cách vẽ lại từng chữ.
    Trả về (chữ mới, trạng thái): 'verified' (mọi chữ được xác nhận/sửa), 'partial' hoặc 'skip'."""
    text = line['text']
    chars = [c for c in text if not c.isspace()]
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(chars) or not len(rows):
        return text, 'skip', []
    m = m[rows.min():rows.max() + 1]
    cs = align(m, chars)
    if cs is None:
        return text, 'skip', []              # không ghép được mảnh mực với từng chữ -> không đoán
    hs = [_height(m[:, a:b]) for a, b in cs]
    # chữ THƯỚC ĐO cỡ chữ của dòng: kanji cao nhất; không có thì kana/chữ Latin cao nhất
    # (không dùng chữ nhỏ ゃゅょっ, dấu câu, dấu ngoặc vì chiều cao khác thường)
    SKIP = set('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ()（）「」『』[]〔〕|｜~～ー一-、。.,・')
    FLAT = set('一二三ー－-_=〜~•·・')          # chữ dẹt: chiều cao không phản ánh cỡ chữ
    order = [i for i in range(len(chars)) if KANJI_RE.match(chars[i]) and chars[i] not in FLAT] or \
            [i for i in range(len(chars)) if chars[i] not in SKIP and chars[i] not in FLAT and not chars[i].islower()]
    ri = max(order, key=lambda i: hs[i]) if order else None
    ref_h = hs[ri] if ri is not None else None
    ref_c = chars[ri] if ri is not None else None
    rest = [i for i in order if i != ri]
    ri2 = max(rest, key=lambda i: hs[i]) if rest else None
    # nhãn phương án ở đầu dòng: "A." "C." "1." "(2)"
    lm = _re.match(r'^\s*[（(]?[A-Ea-e1-4][)）]?[.．:]?', text)
    label_idx = set(range(len([c for c in lm.group(0) if not c.isspace()]))) if lm and len(chars) > 2 else set()
    new, notes, all_ok = list(chars), [], True
    fit_min = 1.0
    for i, ((a, b), c) in enumerate(zip(cs, chars)):
        pool = rivals(c)
        if pool is None:
            # chữ không có tập đối thủ (kanji ngoài nhóm hay nhầm, chữ có dấu tiếng Việt...):
            # không thể XÁC NHẬN; chỉ thử sửa nếu nó thuộc một nhóm hay nhầm
            all_ok = False
            continue
        if i in label_idx:
            continue                       # nhãn phương án "A." – đã có kiểm tra thứ tự nhãn ở bước cấu trúc
        if ri is None:
            # không có chữ thước đo chiều cao: cặp chỉ khác KÍCH THƯỚC (。/○, っ/つ) không so được -> bỏ khỏi đối thủ
            sz = {t for p in SIZE_TWINS if c in p for t in p}
            pool = [p for p in pool if p not in sz]
        cand = [c] + pool
        if ri is not None and i != ri:
            sc = score(m[:, a:b], cand, hs[i] / ref_h, ref_c)
        elif ri2 is not None:              # chính chữ thước đo: so chiều cao với chữ cao thứ hai
            sc = score(m[:, a:b], cand, hs[i] / hs[ri2], chars[ri2])
        else:
            sc = score(m[:, a:b], cand)
        if not sc:
            all_ok = False; continue
        shp = score.shape
        fit_min = min(fit_min, max(shp.values()))      # ô này khớp tốt nhất được bao nhiêu với BẤT KỲ chữ nào
        best = max(sc, key=sc.get)
        others = sorted((v for k, v in sc.items() if k != best), reverse=True)
        margin = sc[best] - (others[0] if others else 0)
        if shp[best] >= OWN_MIN and margin < MARGIN and others:
            # sát điểm: so riêng phần nét khác nhau giữa 2 chữ dẫn đầu
            second = max((k for k in sc if k != best), key=sc.get)
            w = discriminate(m[:, a:b], best, second)
            # chỉ dùng để XÁC NHẬN chữ OCR đã đọc (đo trên 1298 cặp: chọn sai 1.8%, chủ yếu い/り)
            # -> không bao giờ dùng để SỬA sang chữ khác
            if w is not None and w == c and shp.get(w, 0) >= OWN_MIN:
                rest3 = sorted((v for k, v in sc.items() if k not in (best, second)), reverse=True)
                if not rest3 or sc[w] - rest3[0] >= MARGIN:     # chữ thứ ba phải bị bỏ xa
                    best, margin = w, MARGIN
        if shp[best] < OWN_MIN or margin < MARGIN:
            FAILS.append((c, best, shp[best], round(margin, 3), sorted(sc.items(), key=lambda kv: -kv[1])[:3]))
        if shp[best] >= OWN_MIN and margin >= MARGIN:
            if best != c:
                prev_c = chars[i - 1] if i else ' '
                next_c = chars[i + 1] if i + 1 < len(chars) else ' '
                odd = c in '~～' or (c.isascii() and c.isalpha() and bool(JA_RE.match(prev_c) or JA_RE.match(next_c)))
                # chỉ SỬA sang chữ thuộc nhóm hay nhầm và CÙNG LOẠI chữ; ngoại lệ: chữ OCR đọc vốn
                # lạc loại ("~", chữ Latin chen giữa chữ Nhật như 毎H)
                if best in group_of(c) and (odd or kind(best) == kind(c)):
                    new[i] = best
                    notes.append((c, best, sc[best], sc[c]))
                else:
                    all_ok = False               # khớp chữ lạ ngoài nhóm: không tự sửa, để admin xem
        else:
            all_ok = False
    if notes and fit_min < OWN_MIN:
        # có ô chữ không khớp chữ nào -> ghép ô có thể đã lệch -> không tin bất kỳ lần sửa nào trong dòng
        FAILS.append(('ghép ô lệch, huỷ sửa', [n[:2] for n in notes], round(fit_min, 3)))
        new, notes, all_ok = list(chars), [], False
    # ghép lại, giữ nguyên dấu cách của dòng
    out, k = [], 0
    for ch in text:
        if ch.isspace():
            out.append(ch)
        else:
            out.append(new[k]); k += 1
    return ''.join(out), ('verified' if all_ok else 'partial'), notes


STROKE_CH = set('一二三ー－—―‐-')


def stroke_cells(line, ink):
    """Số ô chữ CHỈ gồm nét ngang (一 二 三 ー) trong hộp dòng. PaddleOCR hay làm rơi các chữ này
    (nét mảnh, giống khoảng trắng) dù vẫn đọc tự tin cao. Vạch ở chân dòng (ô trống ＿) không tính."""
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(np.uint8)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(rows):
        return 0
    top, bot = rows.min(), rows.max()
    lh = bot - top + 1
    # nét mảnh màu xám hay bị đứt thành nhiều mẩu khi nhị phân hoá: nối khe ngang nhỏ trước khi tách ô
    colhas = cv2.dilate(m, np.ones((1, max(3, int(0.12 * lh))), np.uint8)).any(axis=0)
    n_cell, x, W = 0, 0, m.shape[1]
    while x < W:
        if not colhas[x]:
            x += 1; continue
        a = x
        while x < W and colhas[x]:
            x += 1
        n, lab, st, _ = cv2.connectedComponentsWithStats(m[:, a:x])
        comps = [st[i] for i in range(1, n) if st[i][4] >= 6]
        if not comps:
            continue
        flat = all(c[2] >= 3 * c[3] and c[3] <= 0.18 * lh for c in comps)
        cy = [(c[1] + c[3] / 2 - top) / lh for c in comps]
        if flat and x - a >= 0.45 * lh and len(comps) <= 3 and min(cy) > 0.12 and max(cy) < 0.88:
            n_cell += 1
    return n_cell


def restore_rows(rows, ink, log, soft=None):
    """Chạy khôi phục cho mọi dòng OCR không chắc (điểm < 0.95) hoặc có dấu hiệu đọc nhầm.
    soft: mặt nạ mực nhạy hơn (giữ nét xám mảnh) dùng cho dòng nghi rơi chữ nét ngang."""
    base_ink = ink
    sus = _re.compile(r'[~～]|[A-Za-z](?=[぀-ヿ一-鿿])|(?<=[぀-ヿ一-鿿])[A-Za-z]')
    for r in rows:
        for l in r['ls']:
            if l.get('src') == 'text':
                continue
            ink = base_ink
            # chữ chỉ có nét ngang bị rơi: ảnh có nhiều ô 一/二/ー hơn số chữ đó trong văn bản OCR.
            # Dấu hiệu này YẾU (font giãn rộng cũng gây ra) -> chỉ sửa khi so ảnh xác nhận cả dòng,
            # không xác nhận được thì giữ nguyên dòng, KHÔNG gắn cờ thiếu chữ.
            stroke_try = False
            if not l.get('missing') and soft is not None and                     stroke_cells(l, soft) > sum(c in STROKE_CH for c in l['text']):
                stroke_try = True
                ink = soft                        # nét xám mảnh: so ảnh trên mặt nạ nhạy hơn
                h = l['box'][3] - l['box'][1]
                if not any(o is not l and min(o['box'][2], l['box'][2]) - max(o['box'][0], l['box'][0]) > 0.1 * h
                           for o in r['ls']):
                    t2 = fill_missing(l, ink)
                    if t2 is not None:
                        t3, st3, _ = restore_line(dict(l, text=t2), ink)
                        if st3 == 'verified':
                            log.append(('nhận dạng chữ nét ngang OCR làm rơi, so ảnh xác nhận cả dòng:', l['text'], '->', t2))
                            l['text'] = t2
                            l['score'] = max(l['score'], 0.95)
                            l['glyph_verified'] = True
                            continue
                log.append(('nghi rơi chữ nét ngang nhưng so ảnh không xác nhận, giữ nguyên:', l['text']))
                ink = base_ink
            rare = any(KANJI_RE.match(c) and not _jis1(c) for c in l['text'])
            if l['score'] >= 0.95 and not sus.search(l['text']) and not rare and not l.get('missing'):
                continue
            # hộp chữ chồng lên hộp chữ khác cùng hàng = mực dùng chung (OCR đọc lặp nửa chữ "A v" + "will"):
            # không biết mực thuộc dòng nào -> không xác nhận, không sửa
            h = l['box'][3] - l['box'][1]
            if any(o is not l and min(o['box'][2], l['box'][2]) - max(o['box'][0], l['box'][0]) > 0.1 * h
                   for o in r['ls']):
                log.append(('không so ảnh (hộp chữ chồng lên dòng bên cạnh):', l['text']))
                continue
            if l.get('missing'):
                t2 = fill_missing(l, ink)
                if t2 is None:
                    continue
                log.append(('nhận dạng chữ OCR làm rơi bằng so ảnh:', l['text'], '->', t2))
                l['text'] = t2
            t, st, notes = restore_line(l, ink)
            if l.get('missing'):
                if st == 'verified':
                    l['missing'] = False          # chữ điền vào + cả dòng đều được so ảnh xác nhận
                else:
                    log.append(('chữ điền vào chưa được xác nhận cả dòng, bỏ:', l['text']))
                    continue
            if st == 'skip':
                continue
            if notes:
                l['text'] = t
                log.append(('khôi phục chữ bằng so ảnh:', ', '.join('%s→%s (%.2f>%.2f)' % n for n in notes), '|', t))
            if st == 'verified':
                if l['score'] < 0.95:
                    log.append(('so ảnh xác nhận mọi chữ của dòng:', t, l['score'], '-> 0.95'))
                l['score'] = max(l['score'], 0.95)
                l['glyph_verified'] = True


def _jis1(c):
    try:
        b = c.encode('cp932'); v = b[0] * 256 + b[1]
        return 0x889F <= v <= 0x9872
    except (UnicodeEncodeError, IndexError):
        return False


def fill_missing(line, ink):
    """OCR làm rơi chữ (hộp có nhiều mực hơn số chữ đọc được): tìm chỗ chữ bị rơi bằng ghép mảnh mực,
    rồi NHẬN DẠNG ô chữ đó bằng so ảnh với toàn bộ kana + chữ Latin + ký hiệu.
    Chỉ điền khi đúng 1 chữ thắng rõ ràng; trả về dòng mới hoặc None."""
    text = line['text']
    chars = [c for c in text if not c.isspace()]
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(rows):
        return None
    m = m[rows.min():rows.max() + 1]
    best = None
    for pos in range(len(chars) + 1):          # thử chữ bị rơi ở từng vị trí
        trial = chars[:pos] + ['あ'] + chars[pos:]
        cs = align(m, trial)
        if cs is not None and (best is None or align.cost < best[0]):
            best = (align.cost, pos, cs[pos])
    if best is None:
        return None
    _, pos, (a, b) = best
    pool = HIRA + KATA + ASCII + PUNCT + list('一二三')
    sc = score(m[:, a:b], pool)
    if not sc:
        return None
    # cặp giống hệt (へ/ヘ): chọn hệ chữ theo chữ kề bên; không có chữ kề bên thì hiragana (trợ từ)
    near = (chars[pos - 1] if pos else '') + (chars[pos] if pos < len(chars) else '')
    use_kata = any('ァ' <= c <= 'ヺ' for c in near)
    for p in TWINS:
        drop = p[0] if use_kata else p[1]
        sc.pop(drop, None)
    # 一 và ー là cùng một nét: sau katakana là trường âm ー, còn lại là chữ 一; gạch ngang Latin bỏ
    for c in ('一' if (pos and 'ァ' <= chars[pos - 1] <= 'ヺ') else 'ー', '－', '-', '_', '~', '—', '―'):
        sc.pop(c, None)
    shp = score.shape
    r = sorted(sc.items(), key=lambda kv: -kv[1])
    if shp[r[0][0]] < OWN_MIN or r[0][1] - r[1][1] < MARGIN:
        return None
    new = chars[:pos] + [r[0][0]] + chars[pos:]
    # giữ dấu cách cũ: chèn chữ vào sau ký tự thứ pos (không tính dấu cách)
    out, k = [], 0
    for ch in text:
        if not ch.isspace():
            if k == pos:
                out.append(r[0][0])
            k += 1
        out.append(ch)
    if k == pos:
        out.append(r[0][0])
    return ''.join(out)


def confirm_variant(line, ink, run, alt):
    """Có bằng chứng ĐỘC LẬP (từ điển / cách viết nhất quán trong đề) gợi ý `alt` thay cho `run`:
    so ảnh RIÊNG chữ khác nhau giữa hai cụm. Trả về True nếu ảnh ủng hộ `alt` rõ ràng."""
    chars = [c for c in line['text'] if not c.isspace()]
    s = ''.join(chars)
    k = s.find(run)
    if k < 0 or len(run) != len(alt):
        return False
    diffs = [i for i in range(len(run)) if run[i] != alt[i]]
    if len(diffs) != 1:
        return False
    i = k + diffs[0]
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(rows):
        return False
    m = m[rows.min():rows.max() + 1]
    cs = align(m, chars)
    if cs is None:
        return False
    # ghép ô phải đáng tin quanh chữ cần xét: ô bên trái/phải khớp tốt chữ của nó
    for j in (i - 1, i + 1):
        if 0 <= j < len(chars) and not chars[j].isspace():
            sc = score(m[:, cs[j][0]:cs[j][1]], [chars[j]])
            if score.shape.get(chars[j], 0) < OWN_MIN:
                return False
    o, n = chars[i], alt[diffs[0]]
    cell = m[:, cs[i][0]:cs[i][1]]
    sc = score(cell, [o, n]); shp = score.shape
    if shp[n] >= OWN_MIN and sc[n] - sc[o] >= MARGIN:
        return True
    return shp[n] >= OWN_MIN and discriminate(cell, o, n) == n


def consistency_suspects(text, doc_text):
    """Cụm kanji xuất hiện 1 lần, trong khi cụm khác đúng 1 kanji TRÔNG GIỐNG xuất hiện >= 2 lần
    trong cả đề (背木 1 lần / 青木 5 lần) -> nghi OCR đọc nhầm."""
    out = []
    for m in _re.finditer(r'[一-鿿]{2,}', text):
        w = m.group(0)
        if doc_text.count(w) > 1:
            continue
        for i, c in enumerate(w):
            for v in set(NEIGHBORS.get(c, '')) | set(group_of(c)):
                alt = w[:i] + v + w[i + 1:]
                if doc_text.count(alt) >= 2:
                    out.append({'run': w, 'variant': alt, 'word': alt, 'kind': 'consist'})
    return out


SIZE_PAIRS = {}
for _p in ['やゃ', 'ゆゅ', 'よょ', 'つっ', 'あぁ', 'いぃ', 'うぅ', 'えぇ', 'おぉ', 'わゎ',
           'ヤャ', 'ユュ', 'ヨョ', 'ツッ', 'アァ', 'イィ', 'ウゥ', 'エエ', 'オォ', 'ワヮ', 'カヵ', 'ケヶ']:
    if _p[0] != _p[1]:
        SIZE_PAIRS[_p[0]] = _p[1]; SIZE_PAIRS[_p[1]] = _p[0]
SIZE_GAP = 0.10


def size_audit(rows, ink, log):
    """Rà MỌI dòng OCR (kể cả dòng OCR tự tin cao): chữ có bản nhỏ/bản to (や/ゃ, つ/っ) được so
    chiều cao với chữ thước đo của dòng. Chỉ sửa khi bản kia thắng rõ (>= SIZE_GAP) và hai ô bên cạnh
    khớp tốt (ghép ô không lệch). OCR hay đọc ゃ thành や dù rất tự tin (じてんしゃ -> じてんしや)."""
    for r in rows:
        for l in r['ls']:
            if l.get('src') == 'text' or not any(c in SIZE_PAIRS for c in l['text']):
                continue
            h = l['box'][3] - l['box'][1]
            if any(o is not l and min(o['box'][2], l['box'][2]) - max(o['box'][0], l['box'][0]) > 0.1 * h for o in r['ls']):
                continue
            chars = [c for c in l['text'] if not c.isspace()]
            x0, y0, x1, y1 = l['box']
            m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
            rws = np.flatnonzero(m.any(axis=1))
            if not len(rws):
                continue
            m = m[rws.min():rws.max() + 1]
            cs = align(m, chars)
            if cs is None:
                continue
            hs = [_height(m[:, a:b]) for a, b in cs]
            SK = set('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ()（）「」『』[]〔〕|｜~～ー一二三-_、。.,・•·')
            ref = [i for i in range(len(chars)) if KANJI_RE.match(chars[i]) and chars[i] not in SK] or \
                  [i for i in range(len(chars)) if JA_RE.match(chars[i]) and chars[i] not in SK and chars[i] not in SIZE_PAIRS]
            if not ref:
                continue
            ri = max(ref, key=lambda i: hs[i])
            new = list(chars); notes = []
            for i, c in enumerate(chars):
                if c not in SIZE_PAIRS or i == ri:
                    continue
                ok_nb = True
                for j in (i - 1, i + 1):
                    if 0 <= j < len(chars):
                        score(m[:, cs[j][0]:cs[j][1]], [chars[j]])
                        if score.shape.get(chars[j], 0) < OWN_MIN:
                            ok_nb = False
                if not ok_nb:
                    continue
                t = SIZE_PAIRS[c]
                sc = score(m[:, cs[i][0]:cs[i][1]], [c, t], hs[i] / hs[ri], chars[ri])
                shp = score.shape
                # sửa đè lên lần đọc OCR tự tin: bản kia phải khớp hình gần như hoàn hảo (>= 0.97), không chỉ >= OWN_MIN
                if shp[t] >= 0.97 and sc[t] >= 0.97 and sc[t] - sc[c] >= SIZE_GAP:
                    new[i] = t; notes.append((c, t, sc[t], sc[c]))
            if notes:
                out, k = [], 0
                for ch in l['text']:
                    if ch.isspace(): out.append(ch)
                    else: out.append(new[k]); k += 1
                log.append(('sửa chữ nhỏ/chữ to bằng so chiều cao:', l['text'], '->', ''.join(out), notes))
                l['text'] = ''.join(out)


NO_SPACE_NEAR = set('、。，．・「」『』（）()〔〕［］：:；;!！?？…ー〜～゛゜') | set('ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ')


def respace(line, ink, th=0.5):
    """Dựng lại KHOẢNG TRẮNG giữa các cụm từ (đề N5 in cách quãng: この　へやは　暗いです) từ khoảng hở
    thực tế giữa các chữ trên ảnh — PaddleOCR lúc giữ lúc bỏ khoảng này. Chỉ đổi khoảng trắng, không
    đổi chữ. Trả về chuỗi mới hoặc None (không ghép được mực với chữ -> giữ nguyên)."""
    text = line['text']
    if not JA_RE.search(text):
        return None                         # dòng tiếng Anh: khoảng trắng của OCR đáng tin
    chars = [c for c in text if not c.isspace()]
    if len(chars) < 2:
        return None
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(rows):
        return None
    m = m[rows.min():rows.max() + 1]
    cs = align(m, chars)
    if cs is None:
        return None
    h = m.shape[0]
    out = chars[0]
    for i in range(1, len(chars)):
        gap = cs[i][0] - cs[i - 1][1]
        if gap > th * h and chars[i - 1] not in NO_SPACE_NEAR and chars[i] not in NO_SPACE_NEAR:
            out += '　'
        out += chars[i]
    return out


def _seg_cost(mask, chars):
    if not chars:
        return 0.0 if not mask.any() else 1e9
    if align(mask, chars) is None:
        return 1e9
    return align.cost * len(chars)


SHAPE_W = 4.0


def respace2(line, ink, th=0.7):
    """Như respace nhưng chắc hơn: cắt dòng thành CỤM tại khoảng hở lớn trên ảnh, chia chữ vào từng cụm,
    rồi thử dịch mỗi ranh giới cụm ±1 chữ, giữ cách chia mà chữ khớp mực tốt nhất (sửa lỗi đặt khoảng
    trắng lệch một chữ). Trả về chuỗi mới hoặc None."""
    text = line['text']
    if not JA_RE.search(text):
        return None
    chars = [c for c in text if not c.isspace()]
    if len(chars) < 2:
        return None
    x0, y0, x1, y1 = line['box']
    m = ink[max(0, y0):y1, max(0, x0):x1].astype(bool)
    rows = np.flatnonzero(m.any(axis=1))
    if not len(rows):
        return None
    m = m[rows.min():rows.max() + 1]
    h = m.shape[0]
    if _re.search(r'[_＿\-－★☆]', text):
        return None                         # dòng có ô gạch (＿ ★): vạch ô bị xoá để lại khoảng hở giả
    # ô ngoặc （　　）: hai dấu ngoặc là mực thật nên vẫn đo được; khoảng hở BÊN TRONG ngoặc không bao giờ
    # thành khoảng trắng vì dấu ngoặc thuộc NO_SPACE_NEAR
    cs = align(m, chars)
    if cs is None:
        return None
    # ngưỡng theo CHÍNH dòng này: font giãn chữ (đề JLPT chính thức) có khoảng hở giữa hai chữ
    # trong cùng một từ đã lớn -> khoảng trắng cụm từ phải lớn hơn hẳn khoảng hở thường gặp
    inner = [cs[i][0] - cs[i - 1][1] for i in range(1, len(cs))
             if chars[i - 1] not in NO_SPACE_NEAR and chars[i] not in NO_SPACE_NEAR]
    th_space = max(th, float(np.median(inner)) / h + 0.6) if inner else th
    # cụm mực: chia tại khoảng hở > th*h (ranh giới đặt giữa khoảng hở)
    col = m.any(axis=0)
    xs = np.flatnonzero(col)
    cuts, gapw, run_start = [], [], None
    for x in range(xs.min(), xs.max() + 1):
        if not col[x]:
            if run_start is None:
                run_start = x
        elif run_start is not None:
            if x - run_start > th * h:
                cuts.append((run_start + x) // 2)
                gapw.append(x - run_start)
            run_start = None
    if not cuts:
        return ''.join(chars)
    bounds = [0] + cuts + [m.shape[1]]
    segs = [m[:, bounds[k]:bounds[k + 1]] for k in range(len(bounds) - 1)]
    # chia chữ cho TẤT CẢ cụm cùng lúc (quy hoạch động): chi phí = độ lệch bề rộng chữ trong từng cụm
    # + độ khớp hình dạng của chữ đầu / cuối mỗi cụm (chữ ở mép cụm là chỗ hay chia lệch một chữ)
    S, M = len(segs), len(chars)
    INF = 1e9
    memo = {}
    def seg_cost(k, a, b):
        key = (k, a, b)
        if key not in memo:
            seg, cc = segs[k], chars[a:b]
            w = seg.shape[1]
            if not cc or len(cc) > w / (0.2 * h) + 1 or len(cc) < w / (1.6 * h) - 1:
                memo[key] = INF
            else:
                cl = align(seg, cc)
                if cl is None:
                    # mảnh mực dính nhau (số "24" liền nét) nên không ghép từng chữ được:
                    # chỉ so TỔNG bề rộng, kèm điểm phạt
                    xs_ = np.flatnonzero(seg.any(axis=0))
                    wi = (xs_.max() - xs_.min() + 1) if len(xs_) else 0
                    c = 1.0 + 2.0 * abs(wi - sum(_expw(ch, h) for ch in cc)) / h
                    # vẫn so HÌNH DẠNG chữ ở hai mép cụm (ô mép lấy theo bề rộng dự kiến của chữ đó)
                    P_ = pieces_of(seg)
                    if P_:
                        for ch, order in ((cc[-1], P_[::-1]), (cc[0], P_)):
                            want = 0.6 * _expw(ch, h)
                            lo = hi = None
                            for a_p, b_p in order:
                                lo = a_p if lo is None else min(lo, a_p)
                                hi = b_p if hi is None else max(hi, b_p)
                                if hi - lo >= want:
                                    break
                            score(seg[:, lo:hi], [ch])
                            c += SHAPE_W * (1.0 - score.shape.get(ch, 0))
                    memo[key] = c
                else:
                    c = align.cost * len(cc)
                    for (x0_, x1_), ch in ((cl[0], cc[0]), (cl[-1], cc[-1])):
                        score(seg[:, x0_:x1_], [ch])
                        c += SHAPE_W * (1.0 - score.shape.get(ch, 0))
                    memo[key] = c
        return memo[key]
    dp = [[INF] * (M + 1) for _ in range(S + 1)]
    bk = [[0] * (M + 1) for _ in range(S + 1)]
    dp[0][0] = 0
    for k in range(1, S + 1):
        for b_ in range(k, M - (S - k) + 1):
            for a_ in range(k - 1, b_):
                if dp[k - 1][a_] >= INF:
                    continue
                c = dp[k - 1][a_] + seg_cost(k - 1, a_, b_)
                if c < dp[k][b_]:
                    dp[k][b_] = c; bk[k][b_] = a_
    if dp[S][M] >= INF:
        return None
    cnt, b_ = [], M
    for k in range(S, 0, -1):
        a_ = bk[k][b_]; cnt.append(b_ - a_); b_ = a_
    cnt = cnt[::-1]
    def slices(cn):
        out, p_ = [], 0
        for n in cn:
            out.append(chars[p_:p_ + n]); p_ += n
        return out
    parts = [''.join(s) for s in slices(cnt)]
    lead = _re.match(r'^\s*(\d{1,3}[.．)）])\s', text)      # "2. わたし": giữ dấu cách sau số câu
    if _os.environ.get('DEBUG_RS'): print('segs', [s_.shape[1] for s_ in segs], 'parts', parts, 'cost', round(dp[S][M], 3))
    out = parts[0]
    for k, p in enumerate(parts[1:]):
        sp = gapw[k] > th_space * h and out[-1] not in NO_SPACE_NEAR and p[0] not in NO_SPACE_NEAR
        out += ('　' if sp else '') + p
    if lead and out.startswith(lead.group(1)) and not out[len(lead.group(1)):][:1].isspace():
        out = lead.group(1) + ' ' + out[len(lead.group(1)):]
    return out


def respace_rows(rows, ink, log):
    """Dựng lại khoảng trắng cho mọi dòng OCR tiếng Nhật (không đụng dòng lấy từ lớp chữ PDF)."""
    n = 0
    for r in rows:
        for l in r['ls']:
            if l.get('src') == 'text':
                continue
            new = respace2(l, ink)
            if new and _re.sub(r'\s', '', new) == _re.sub(r'\s', '', l['text']) and new != l['text']:
                l['text'] = new; n += 1
    if n:
        log.append(('dựng lại khoảng trắng theo khoảng hở trên ảnh:', n, 'dòng'))


_LOOK_EQ = {'卜': 'ト', '一': 'ー', '口': 'ロ', '力': 'カ', '工': 'エ', '夕': 'タ', '二': 'ニ', '八': 'ハ'}


def _eqc(c):
    import unicodedata
    c = unicodedata.normalize('NFKC', c)
    return _LOOK_EQ.get(c, c)


def dedupe_overlap(rows, log):
    """Hai hộp chữ OCR cùng hàng CHỒNG nhau (font giãn chữ) và chữ đầu hộp sau trùng chữ cuối hộp trước
    (kể cả cặp trông giống 卜/ト, 一/ー): cùng một vết mực bị đọc hai lần -> bỏ chữ lặp ở hộp sau."""
    for r in rows:
        ls = sorted(r['ls'], key=lambda l: l['box'][0])
        for a, b in zip(ls, ls[1:]):
            if a.get('src') == 'text' or b.get('src') == 'text':
                continue
            ta, tb = a['text'].rstrip(), b['text'].lstrip()
            if not ta or not tb:
                continue
            h = a['box'][3] - a['box'][1]
            if b['box'][0] < a['box'][2] - 0.25 * h and _eqc(ta[-1]) == _eqc(tb[0]):
                log.append(('chữ bị đọc lặp ở chỗ hai hộp chữ chồng nhau, bỏ chữ lặp:', ta, '|', tb, '->', tb[1:]))
                b['text'] = tb[1:]
                b['box'] = [a['box'][2], b['box'][1], b['box'][2], b['box'][3]]
