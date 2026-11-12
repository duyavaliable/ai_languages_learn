"""Thử nghiệm: PDF -> câu hỏi (JSON giống questions_json) -> trang HTML mô phỏng web.

  python build.py text <pdf> <pages> <answer_pdf|-> <out_dir>      PDF có lớp chữ (pdfplumber)
  python build.py scan <pdf> <pages> <ocr_dir> <out_dir>           PDF scan (đã chạy ocr_run.py)
"""
import sys, os, re, json, statistics
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, cv2, pymupdf

FW = str.maketrans('１２３４５６７８９０ＡＢＣＤ', '1234567890ABCD')
KANJI = re.compile(r'[㐀-鿿々〆]')
DASH = set('-－—–_＿ー~')


def is_wide(ch):
    return ord(ch) > 0x2E80


# ---------------------------------------------------------------- PDF có chữ
def parse_text_pdf(pdf_path, pages, out_dir):
    import pdfplumber
    pdf = pdfplumber.open(pdf_path)
    doc = pymupdf.open(pdf_path)
    items = []            # chuỗi phần tử theo thứ tự đọc của cả đề
    for pno in pages:
        pg = pdf.pages[pno - 1]
        H = pg.height
        chars = [c for c in pg.chars if 45 < c['top'] < H - 40 and c['text'].strip()]
        main = [c for c in chars if c['size'] >= 8.5]
        small = [c for c in chars if c['size'] < 8.5]
        hrules = [r for r in pg.rects if r['height'] <= 1.6 and r['width'] >= 6]
        vrules = [r for r in pg.rects if r['width'] <= 1.6 and 12 <= r['height'] <= 30]
        # cạnh trên/dưới của khung số câu không phải gạch chân
        hrules = [r for r in hrules if not any(abs(v['x0'] - r['x0']) < 2.5 or abs(v['x0'] - r['x1']) < 2.5 for v in vrules)]

        # 1. dòng chữ chính
        main.sort(key=lambda c: (round(c['top']), c['x0']))
        lines = []
        for c in main:
            for ln in lines:
                if abs(ln['top'] - c['top']) < 2.5:
                    ln['chars'].append(c); break
            else:
                lines.append({'top': c['top'], 'chars': [c]})
        for ln in lines:
            ln['chars'].sort(key=lambda c: c['x0'])
            ln['bottom'] = max(c['bottom'] for c in ln['chars'])
            ln['x0'] = ln['chars'][0]['x0']; ln['x1'] = ln['chars'][-1]['x1']
            ln['size'] = statistics.median(c['size'] for c in ln['chars'])
            for c in ln['chars']:
                c['u'] = False; c['ruby'] = None
        lines.sort(key=lambda l: l['top'])

        # 2. gạch chân / ô trống: vạch ngang mảnh ngay dưới dòng
        for ln in lines:
            ln['slots'] = []
            for r in hrules:
                if not (ln['bottom'] - 3 <= r['top'] <= ln['bottom'] + 5):
                    continue
                over = [c for c in ln['chars'] if r['x0'] - 1 <= (c['x0'] + c['x1']) / 2 <= r['x1'] + 1]
                real = [c for c in over if c['text'] not in '★']
                if real:
                    for c in real: c['u'] = True
                else:  # vạch không có chữ phía trên = ô trống (dạng ★)
                    ln['slots'].append({'x0': r['x0'], 'x1': r['x1'], 'star': bool(over)})
                    for c in over: c['slot'] = True

        # 3. furigana: chữ nhỏ ngay trên kanji
        small.sort(key=lambda c: (round(c['top']), c['x0']))
        runs = []
        for c in small:
            if runs and abs(runs[-1]['top'] - c['top']) < 1.5 and c['x0'] - runs[-1]['x1'] < c['size'] * 1.6:
                runs[-1]['text'] += c['text']; runs[-1]['x1'] = c['x1']
            else:
                runs.append({'top': c['top'], 'x0': c['x0'], 'x1': c['x1'], 'text': c['text']})
        for run in runs:
            below = [l for l in lines if 2 <= l['top'] - run['top'] <= 16]
            if not below:
                continue
            ln = min(below, key=lambda l: l['top'])
            mid = (run['x0'] + run['x1']) / 2
            cand = [c for c in ln['chars'] if KANJI.match(c['text']) and c['x1'] > run['x0'] - 3 and c['x0'] < run['x1'] + 3]
            if not cand:
                continue
            # giữ cụm kanji liền nhau gần tâm furigana nhất
            cand.sort(key=lambda c: c['x0'])
            groups = [[cand[0]]]
            for c in cand[1:]:
                (groups[-1].append(c) if c['x0'] - groups[-1][-1]['x1'] < 1 else groups.append([c]))
            g = min(groups, key=lambda g: abs((g[0]['x0'] + g[-1]['x1']) / 2 - mid))
            g[0]['ruby'] = (len(g), run['text'])

        # 4. ô số câu (khung vuông bên trái)
        for ln in lines:
            ln['boxed'] = any(r['x0'] < ln['x0'] + 2 and r['top'] < ln['bottom'] and r['bottom'] > ln['top'] for r in vrules)
            ln['text'] = render_chars(ln)
            items.append({'kind': 'line', 'page': pno, **{k: ln[k] for k in ('top', 'bottom', 'x0', 'x1', 'size', 'text', 'boxed')}, 'pw': pg.width})

        # 5. ảnh nhúng
        for im in pg.images:
            items.append({'kind': 'image', 'page': pno, 'top': im['top'], 'bbox': (im['x0'], im['top'], im['x1'], im['bottom'])})
        items.sort(key=lambda it: (it['page'], it['top']))
    return items, doc


def render_chars(ln):
    """Chữ của một dòng -> chuỗi có [[gạch chân]], {kanji|furigana}, ô trống."""
    out, i, cs = [], 0, ln['chars']
    toks = []
    for c in cs:
        if c.get('slot'):
            continue
        toks.append(('c', c['x0'], c))
    for s in ln['slots']:
        toks.append(('s', s['x0'], s))
    toks.sort(key=lambda t: t[1])
    prev_x1, u_open = None, False
    k = 0
    while k < len(toks):
        kind, x, o = toks[k]
        x1 = o['x1']
        gap = (x - prev_x1) if prev_x1 is not None else 0
        if prev_x1 is not None and gap > ln['size'] * 0.6:
            if u_open: out.append(']]'); u_open = False
            out.append('　')
        if kind == 's':
            if u_open: out.append(']]'); u_open = False
            out.append('〔★〕' if o['star'] else '〔_〕')
            prev_x1 = x1; k += 1; continue
        if o['u'] and not u_open: out.append('[['); u_open = True
        if not o['u'] and u_open: out.append(']]'); u_open = False
        if o['ruby']:
            n, rt = o['ruby']
            base = ''.join(t[2]['text'] for t in toks[k:k + n])
            out.append('{%s|%s}' % (base, rt))
            prev_x1 = toks[k + n - 1][2]['x1']; k += n; continue
        out.append(o['text']); prev_x1 = x1; k += 1
    if u_open: out.append(']]')
    return re.sub(r'\]\]　\[\[', '　', ''.join(out).strip())


OPT_LABEL = re.compile(r'^([1-4])(?:　|(?=[^\d\s]))')


def split_options(text):
    """'１ 果　２ 楽　３ 菓　４ 薬' -> ['果','楽','菓','薬'] (theo nhãn 1..4)."""
    t = text.translate(FW)
    parts, cur, want = [], None, 1
    for tok in t.split('　'):
        if not tok:
            continue
        m = re.match(r'^(%d)(.*)$' % want, tok) if want <= 4 else None
        if m and (m.group(2) == '' or not m.group(2)[0].isdigit()):
            if cur is not None: parts.append(cur)
            cur = m.group(2); want += 1
            continue
        if cur is None:
            return None
        cur = (cur + '　' + tok) if cur else tok
    if cur is not None: parts.append(cur)
    return [p.strip('　') for p in parts]


def build_text_questions(items, pw):
    """Gom dòng -> mục 問題 / đoạn văn / câu hỏi / phương án."""
    qs, section, passage, sec_lines = [], None, [], []
    cur = None
    base_x = None
    state = 'body'
    for it in items:
        if it['kind'] == 'image':
            if cur: cur.setdefault('images', []).append(it)
            continue
        t = it['text']
        tt = t.translate(FW)
        if re.match(r'^問題\s?\d', tt):
            section = t; passage = []; state = 'heading'; cur = None
            continue
        if state == 'heading':
            if not section.endswith('。'):
                section += t; continue
            state = 'body'
        m = re.match(r'^(\d{1,2})　?(.*)$', tt)
        if it['boxed'] and m:
            rest = t[len(m.group(1)):].lstrip('　')
            cur = {'id': int(m.group(1)), 'section': section, 'passage': '\n\n'.join(passage) or None,
                   'question': '', 'options': [], 'raw_opts': []}
            qs.append(cur)
            if OPT_LABEL.match(rest.translate(FW)):
                cur['raw_opts'].append(rest)
            else:
                cur['question'] = rest
            continue
        if cur is not None and OPT_LABEL.match(tt) and len(cur['raw_opts']) < 4:
            cur['raw_opts'].append(t); continue
        if cur is not None and not cur['raw_opts']:
            cur['question'] += '\n' + t; continue        # câu hỏi nhiều dòng (hội thoại)
        if cur is not None and cur['raw_opts'] and not split_complete(cur):
            cur['raw_opts'].append(t); continue
        # còn lại: đoạn văn của mục -> nối dòng bị ngắt
        cur = None
        indent = base_x is not None and it['x0'] > base_x + 6
        if passage and not indent and prev_full:
            passage[-1] += t
        else:
            passage.append(t)
            if base_x is None or it['x0'] < base_x: base_x = it['x0']
        prev_full = it['x1'] > pw - 70
    for q in qs:
        joined = '　'.join(q['raw_opts'])
        q['options'] = split_options(joined) or []
        del q['raw_opts']
    return qs


def split_complete(q):
    o = split_options('　'.join(q['raw_opts']))
    return bool(o) and len(o) >= 4


# ---------------------------------------------------------------- PDF scan
def ink_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Mực = điểm TỐI (chữ đen hoặc xanh đậm). Viền tim đỏ và chữ nền nhạt đều sáng -> bị loại.
    # + màu rất đậm (chữ xanh/đỏ tươi); chữ nền in mờ có độ đậm màu thấp nên vẫn bị loại.
    from frames import ink_mask as _im       # ngưỡng hai mức: giữ nét mảnh màu xám (一, 二)
    return _im(img)


def parse_scan_page(img_path, ocr_lines):
    img = cv2.imread(img_path)
    Hh, Ww = img.shape[:2]
    ink = ink_mask(img)
    heights = [l['box'][3] - l['box'][1] for l in ocr_lines]
    # cỡ chữ của trang đo trên DÒNG CHỮ (>= 2 chữ thật): trang đề nghe nhiều tranh có hàng chục số nhãn
    # "1" "2" nhỏ trong tranh, lấy trung vị mọi hộp thì cỡ chữ bị đo nhỏ đi một nửa
    th_ = [l['box'][3] - l['box'][1] for l in ocr_lines if len(re.sub(r'[\d\W_]', '', l['text'])) >= 2]
    mh = statistics.median(th_ if len(th_) >= 5 else heights) if heights else 70   # trang bìa / trang trống
    # bỏ đầu/chân trang, chữ nền (to bất thường)
    # vùng lề trên/dưới: bỏ đầu/chân trang, NHƯNG giữ tiêu đề mục / số câu (đề lề hẹp như IELTS
    # có "Questions 27-30" nằm sát mép trên)
    keep_head = re.compile(r'^\s*(問題\s?\d|もんだい\s?\d|Questions?\s+\d|QUESTIONS?\s+\d|Part\s+\d|PART\s+\d|\d{1,2}[.．]\s*\S)')
    # tiêu đề câu của đề nghe ("1ばん", "れい"): chữ đậm, to; đứng sát tranh nên phải giữ riêng
    marker = re.compile(r'^\s*(\d{1,2}\s*[ばぱ]ん|\d{1,2}\s*番|れい|例)\s*$')
    big_ok = re.compile(r'^\s*(問題|もんだい)')
    lines = [l for l in ocr_lines if (0.075 * Hh < l['box'][1] < 0.925 * Hh
                                      or (0.03 * Hh < l['box'][1] < 0.97 * Hh and (keep_head.match(l['text']) or marker.match(l['text']))))
             # tab dọc in ở mép giấy (聴解 / 読解) không phải nội dung đề
             and not (l['box'][2] < 0.04 * Ww or l['box'][0] > 0.96 * Ww)
             # tiêu đề mục chữ to ("もんだい１") được phép cao hơn dòng thường
             and (l['box'][3] - l['box'][1]) < (3.2 if (big_ok.match(l['text']) or marker.match(l['text'])) else 1.8) * mh
             and not (len(l['text'].strip()) <= 2 and l['score'] < 0.95
                     and not re.search(r'[)）。」、]', l['text']))]  # mảnh chữ nền lẻ
    # vùng ảnh: mực còn lại sau khi xoá các dòng chữ bình thường
    m = ink.copy()
    for l in lines:
        x0, y0, x1, y1 = l['box']
        if len(l['text']) > 3 or marker.match(l['text']) or big_ok.match(l['text']):
            m[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6] = 0
    m[:int(0.075 * Hh)] = 0; m[int(0.925 * Hh):] = 0
    m[:, :int(0.06 * Ww)] = 0; m[:, int(0.94 * Ww):] = 0
    dil = cv2.dilate(m, np.ones((41, 41), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(dil)
    # bỏ đường kẻ thẳng dài (khung, kẻ bảng) khỏi phép đo "nét vẽ"
    L = max(20, int(1.1 * mh))
    straight = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((1, L), np.uint8)) | \
        cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((L, 1), np.uint8))
    drawing = m & (1 - straight)
    figs = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if w > 6 * mh and h > 4 * mh:
            # KHUNG CHỮ (đoạn văn đóng khung, bảng) hay HÌNH? Sau khi bỏ chữ và đường kẻ thẳng,
            # hình còn nhiều nét vẽ; khung chữ gần như không còn gì.
            dens = drawing[y:y + h, x:x + w].mean()
            text_lines = [l for l in lines if x <= (l['box'][0] + l['box'][2]) / 2 <= x + w and y <= (l['box'][1] + l['box'][3]) / 2 <= y + h]
            if dens < 0.006 and len(text_lines) >= 2:
                continue   # khung chữ -> giữ chữ, không cắt thành ảnh
            figs.append((x + 15, y + 15, x + w - 15, y + h - 15))
    inside = lambda l, f: f[0] <= (l['box'][0] + l['box'][2]) / 2 <= f[2] and f[1] <= (l['box'][1] + l['box'][3]) / 2 <= f[3]
    lines = [l for l in lines if not any(inside(l, f) for f in figs)]

    # hàng
    lines.sort(key=lambda l: (l['box'][1] + l['box'][3]) / 2)
    rows = []
    for l in lines:
        cy = (l['box'][1] + l['box'][3]) / 2
        if rows and abs(rows[-1]['cy'] - cy) < 0.45 * mh:
            rows[-1]['ls'].append(l)
        else:
            rows.append({'cy': cy, 'ls': [l]})
    for r in rows:
        r['ls'].sort(key=lambda l: l['box'][0])
        r['top'] = min(l['box'][1] for l in r['ls']); r['bottom'] = max(l['box'][3] for l in r['ls'])
        r['first'] = r['ls'][0]['text'].strip()
    return img, ink, rows, figs, mh


HRULES = None      # vạch ngang vector của trang Hybrid [(x0, x1, y)], None = trang scan
FRAMES_B = []      # khung số câu (để bỏ cạnh dưới của khung)


def underline_segments(ink, row, mh):
    """Vạch ngang dài ngay dưới chân chữ của một hàng (ô chữ OCR có thể đã bao cả vạch)."""
    if HRULES is not None and row.get('ls') and any(l.get('src') == 'text' for l in row['ls']):
        # trang có lớp chữ: dùng nét vẽ vector, chỉ lấy vạch nằm ngay dưới hàng
        out = [[a, b] for a, b, y in HRULES if row['bottom'] - 0.25 * mh <= y <= row['bottom'] + 0.45 * mh]
        return _keep_row(_drop_frames(sorted(out), row, mh), row, mh)
    y0 = int(row['bottom'] - 0.35 * mh); y1 = int(row['bottom'] + 0.3 * mh)
    band = ink[y0:y1]
    if band.size == 0:
        return []
    # chỉ nhận cột có nét mảnh nằm ngang: kiểm tra từng hàng pixel
    segs = []
    for yy in range(band.shape[0]):
        rowpix = band[yy]
        xs = np.flatnonzero(np.diff(np.concatenate([[0], rowpix, [0]])))
        for a, b in zip(xs[::2], xs[1::2]):
            if b - a >= 0.7 * mh:
                segs.append([a, b, yy])
    if not segs:
        return []
    # chân chữ của hàng: điểm mực thấp nhất từng cột, KHÔNG tính các hàng pixel thuộc vạch ngang.
    # Gạch chân thật nằm THẤP HƠN hẳn chân chữ; nét ngang ở đáy kanji (車, 章, 国, 生) nằm ngay chân chữ.
    top = max(0, int(row['top']))
    reg = ink[top:y1, :].astype(bool).copy()
    for a, b, yy in segs:
        reg[y0 - top + yy, a:b] = False
    if row.get('ls'):                      # chỉ xét cột thuộc chữ của chính hàng này
        xa = max(0, int(min(l['box'][0] for l in row['ls']))); xb = int(max(l['box'][2] for l in row['ls']))
        reg[:, :xa] = False; reg[:, xb:] = False
    lows = [np.flatnonzero(reg[:, x]).max() for x in range(reg.shape[1]) if reg[:, x].any()]
    gb = top + float(np.median(lows)) if lows else row['bottom']
    segs = [s for s in segs if y0 + s[2] > gb + 0.1 * mh]

    def touches_glyph(a, b, yy):
        """Nét đáy của chữ (上, 生) dính liền nét dọc phía trên; gạch chân thật có khe trắng."""
        if (b - a) >= 1.3 * mh:
            return False
        y = y0 + yy
        while y > top and ink[y - 1, a:b].mean() >= 0.3:      # leo hết bề dày vạch (kể cả mép nhòe)
            y -= 1
        # cột có NÉT DỌC THẬT nối liền lên trên >= 0.15 dòng (không tính 1-2 điểm ảnh nhòe)
        need = max(3, int(0.15 * mh))
        if y - need < 0:
            return False
        col = ink[y - need:y, a:b].astype(bool).all(axis=0)
        run = best = 0
        for v in col:
            run = run + 1 if v else 0; best = max(best, run)
        return best >= 0.04 * mh
    segs = [s for s in segs if not touches_glyph(*s)]
    segs.sort()
    merged = []
    for a, b, _ in segs:
        if merged and a <= merged[-1][1] + 4:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return _keep_row(_drop_frames(merged, row, mh), row, mh)


def _drop_frames(segs, row, mh):
    """Bỏ vạch trùng cạnh dưới của khung số câu."""
    out = []
    for a, b in segs:
        if any(f[1] < row['bottom'] + 0.5 * mh and f[3] > row['top'] and a >= f[0] - 6 and b <= f[2] + 6 for f in FRAMES_B):
            continue
        out.append([a, b])
    return out


def _keep_row(merged, row, mh):
    # chỉ giữ vạch nằm trong phạm vi chữ của CHÍNH hàng này (± 1 dòng): nét của hình vẽ
    # cùng độ cao (khung điện thoại, bảng) không phải gạch chân / ô trống
    if row.get('ls'):
        rx0 = min(l['box'][0] for l in row['ls']) - 1.0 * mh
        rx1 = max(l['box'][2] for l in row['ls']) + 1.0 * mh
        merged = [s for s in merged if s[1] > rx0 and s[0] < rx1]
    return merged


def char_positions(l, ink=None, mh=None):
    """Toạ độ x từng ký tự trong 1 hộp OCR.

    OCR bỏ mất khoảng trắng giữa các cụm từ, nên chia đều theo bề rộng hộp sẽ
    lệch. Ở đây chỉ chia trên phần CÓ MỰC: tìm các cụm mực (bỏ khoảng trống
    rộng), nối chúng lại thành một trục liền rồi đặt từng ký tự lên trục đó."""
    if l.get('cx') and len(l['cx']) == len(l['text']):
        return list(zip(l['text'], l['cx']))     # lớp chữ PDF: toạ độ từng ký tự là chính xác
    x0, y0, x1, y1 = l['box']
    # khoảng trắng KHÔNG có mực: rộng 0 (nằm ở khe giữa hai cụm mực). Tính nó rộng bằng một chữ làm
    # mọi chữ sau nó lệch chỗ -> gạch chân gắn sai / mất (câu 30, 31 đề 3)
    ws = [0.0 if c.isspace() else (1.0 if is_wide(c) else 0.55) for c in l['text']]
    tot = sum(ws) or 1
    runs = [(x0, x1)]
    if ink is not None:
        band = ink[y0 + 2:int(y1 - 0.18 * (y1 - y0)), x0:x1]  # bỏ dải dưới cùng (gạch chân)
        cols = np.flatnonzero(band.max(axis=0)) if band.size else []
        if len(cols):
            runs = []
            start = prev = cols[0]
            for c in cols[1:]:
                if c - prev > 0.45 * mh:
                    runs.append((x0 + start, x0 + prev + 1)); start = c
                prev = c
            runs.append((x0 + start, x0 + prev + 1))
    if len(runs) > 1:
        h = max(1, y1 - y0)
        cap = [(b - a) / (0.85 * h) for a, b in runs]          # số "ô chữ" mỗi cụm chứa được
        need = [w / 1.0 for w in ws]
        if abs(sum(cap) - sum(need)) <= 0.35 * sum(need) + 1:
            pos, ri, used = [], 0, 0.0
            for c, w in zip(l['text'], ws):
                while ri < len(runs) - 1 and used + w / 2 > cap[ri] + 0.35:
                    ri += 1; used = 0.0
                a, b_ = runs[ri]
                cx = a + (used + w / 2) / max(cap[ri], 1e-6) * (b_ - a)
                pos.append((c, min(cx, b_)))
                used += w
            return pos
    total = sum(b - a for a, b in runs) or 1
    def to_x(d):  # khoảng cách trên trục liền -> toạ độ thật
        for a, b in runs:
            if d <= b - a:
                return a + d
            d -= b - a
        return runs[-1][1]
    pos, acc = [], 0
    for c, w in zip(l['text'], ws):
        pos.append((c, to_x((acc + w / 2) / tot * total)))
        acc += w
    return pos


REC = None
SECOND_PASS = os.environ.get('SECOND_PASS', '1') == '1'


def RARE(t):
    from scan_parse import rare_chars
    return rare_chars(t)


def read_crop(img):
    global REC
    if REC is None:
        from paddleocr import TextRecognition
        import ocr_models          # cùng model, chạy bằng ONNX Runtime nếu có
        REC = TextRecognition(**ocr_models.rec_kwargs())
    r = REC.predict(img)[0]
    return r['rec_text'], float(r['rec_score'])


def row_text(row, segs, mh, ink=None, img=None):
    toks, underlined = [], []
    prev_x1 = None
    for l in row['ls']:
        # khoảng hở thật giữa hai ô chữ (> nửa dòng) = khoảng cách giữa cụm từ như bản gốc.
        # Hộp chữ OCR có thể CHỒNG nhau vài điểm ảnh dù trên ảnh có khoảng trắng rõ -> đo trên mực.
        gap = None
        if prev_x1 is not None:
            gap = l['box'][0] - prev_x1
            if ink is not None and gap < 0.5 * mh:
                y0_, y1_ = int(row['top']), int(row['bottom'])
                a_ = int(max(0, min(prev_x1, l['box'][0]) - 0.6 * mh)); b_ = int(max(prev_x1, l['box'][0]) + 0.6 * mh)
                col = ink[y0_:y1_, a_:b_].any(axis=0) if b_ > a_ else np.zeros(0, bool)
                best = run = 0
                for v in col:
                    run = 0 if v else run + 1; best = max(best, run)
                gap = max(gap, best * 0.5 / 0.7)        # cùng ngưỡng 0.7 dòng như bước dựng khoảng trắng
        if gap is not None and gap > 0.5 * mh and is_wide((l['text'] or ' ')[0]) \
                and not (toks and toks[-1][1].isspace()) and not l['text'][:1].isspace():
            toks.append([(prev_x1 + l['box'][0]) / 2, '　', False])
        prev_x1 = l['box'][2]
        for c, x in char_positions(l, ink, mh):
            toks.append([x, c, False])
    slots = []
    page_w = ink.shape[1] if ink is not None else None
    for a, b in segs:
        # đường kẻ ngang dài cả trang: không phải gạch chân / ô trống. So với BỀ RỘNG TRANG, không so với
        # cỡ chữ: cỡ chữ khi nối nhiều trang là trung bình -> gạch chân cả câu bị loại nhầm (câu 30, 31 đề 3)
        if (page_w and b - a > 0.7 * page_w) or (not page_w and b - a > 12 * mh):
            continue
        over = [t for t in toks if a <= t[0] <= b]
        real = [t for t in over if t[1] not in DASH and t[1] not in '★ ']
        if real:   # có chữ thật phía trên vạch -> gạch chân; không có -> ô trống
            underlined.append((a, b))
        else:
            star = any(t[1] == '★' for t in over)
            for t in over: t[1] = ''
            slots.append([(a + b) / 2, '〔★〕' if star else '〔_〕', False])
    toks = [t for t in toks if t[1]] + slots
    toks.sort(key=lambda t: t[0])
    out = ''.join(c for x, c, flag in toks)
    # Mỗi vạch gạch chân: đọc RIÊNG phần chữ nằm trên vạch (lần đọc độc lập với
    # lần đọc cả dòng).
    #  - cụm đọc riêng khớp đúng 1 chỗ trong câu  -> 2 lần đọc đồng ý -> nhận
    #  - không khớp: đọc cụm lần nữa (phóng 2x). Hai lần đọc cụm giống nhau và chỉ
    #    khác chữ của dòng đúng 1 ký tự -> sửa dòng theo cụm (đa số 2/3).
    #  - còn lại -> không đoán, báo không chắc.
    for a, b in underlined:
        y0 = int(row['top']); y1 = int(row['bottom'] + 0.1 * mh)
        a, b = int(a), int(b)
        over_ls = [l for l in row['ls'] if l['box'][0] < b and l['box'][2] > a]
        if over_ls and all(l.get('src') == 'text' for l in over_ls):
            # chữ từ lớp chữ PDF: biết chính xác ký tự nào nằm trên vạch, không cần đọc lại
            piece = ''.join(t[1] for t in toks if a <= t[0] <= b and t[1].strip())
            if piece and count_ws(out, piece) == 1:
                if not re.fullmatch(r'[\s　★\-－—_〔〕]+', piece):
                    out = mark_ws(out, piece)
                continue
            # cụm xuất hiện nhiều lần trong câu -> đi tiếp đường đọc lại như OCR
        p1, s1 = read_crop(img[y0:y1, max(0, a - 4):b + 4])
        p1 = p1.strip(' 　')
        piece = None
        if p1 and count_ws(out, p1) == 1 and s1 >= 0.6:
            piece = p1
        else:
            big = img[max(0, y0 - 6):y1 + 6, max(0, a - 10):b + 10]
            p2, s2 = read_crop(cv2.resize(big, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))
            p2 = p2.strip(' 　')
            if p2 and count_ws(out, p2) == 1 and s2 >= 0.6:
                piece = p2
            elif p1 and (strip_p(p1) == strip_p(p2) or s1 >= 0.9) and max(s1, s2) >= 0.9:
                p1 = strip_p(p1)
                sub = ''.join(t[1] for t in toks if a <= t[0] <= b and t[1].strip())
                # hàng ghép lại từ mảnh có thể không còn dòng OCR nào phủ vạch -> coi là không tin cậy
                line_sc = min((l['score'] for l in row['ls'] if l['box'][0] < b and l['box'][2] > a), default=0.0)
                line_low = line_sc < 0.95
                fz = fuzzy_find(out, p1)
                if not line_low and fz is not None and line_sc > max(s1, s2):
                    # dòng đáng tin hơn lần đọc cụm: lấy VỊ TRÍ từ cụm, giữ CHỮ của dòng
                    piece = fz
                elif (line_low and strip_p(p1) == strip_p(p2) and len(sub) == len(p1) and sum(x != y for x, y in zip(sub, p1)) == 1
                        and out.count(sub) == 1):
                    out = out.replace(sub, p1, 1)
                    piece = p1
                    row.setdefault('corrected', []).append((sub, p1))
                    for l in row['ls']:
                        if l['box'][0] < b and l['box'][2] > a:
                            l['score'] = max(l['score'], 0.95)
            if piece is None:
                row['uncertain'] = True
                row.setdefault('u_debug', []).append((p1, round(s1, 2), p2, round(s2, 2)))
                continue
        if re.fullmatch(r'[\s　★\-－—_〔〕]+', piece):
            continue          # vạch dưới ★ / ô trống: là ô trống, không phải chữ gạch chân
        out = mark_ws(out, piece)
    if '★' in out:  # đề dùng dấu gạch làm ô trống: mỗi '-' là một ô, ★ là ô đánh dấu
        out = re.sub(r'\s*[-－—]\s*', '〔_〕', out)
        out = re.sub(r'\s*(?<!〔)★(?!〕)\s*', '〔★〕', out)   # ★ đã nằm trong ô 〔★〕 thì không bọc lần nữa
    out = re.sub(r'(〔[_★]〕)[ 　]+(?=〔[_★]〕)', r'\1', out)       # khoảng trắng giữa các ô trống
    out = out.replace('(', '（').replace(')', '）')
    out = re.sub(r'（\s*）', '（　　）', out)
    out = re.sub(r'（$', '（　　', out)
    out = re.sub(r'（[\s　]*（', '（', out)
    out = re.sub(r'）[\s　]*）', '）', out)
    return out


def _char_class(c):
    """Một ký tự và dạng toàn khổ / nửa khổ của nó (３ = 3, Ａ = A): lần đọc lại cụm gạch chân
    hay trả chữ số toàn khổ trong khi dòng chữ dùng nửa khổ."""
    import unicodedata
    alts = {c, unicodedata.normalize('NFKC', c)}
    for a in list(alts):
        if len(a) == 1 and '!' <= a <= '~':
            alts.add(chr(ord(a) + 0xFEE0))
    alts = sorted(x for x in alts if len(x) == 1)
    return re.escape(alts[0]) if len(alts) == 1 else '[' + ''.join(re.escape(x) for x in alts) + ']'


def _ws_pattern(piece):
    """Mẫu tìm 'piece' trong câu, cho phép dấu cách bất kỳ giữa các ký tự, không phân biệt toàn khổ / nửa khổ."""
    return re.compile(r'[\s　]*'.join(_char_class(c) for c in piece if not c.isspace()))


def count_ws(out, piece):
    return len(_ws_pattern(piece).findall(out))


def mark_ws(out, piece):
    m = _ws_pattern(piece).search(out)
    return out[:m.start()] + '[[' + m.group(0) + ']]' + out[m.end():] if m else out


def jis_ok(t):
    try:
        t.encode('cp932'); return True
    except UnicodeEncodeError:
        return False


def wild_match(read, cand):
    """read khớp cand, cho phép chữ ngoài bảng mã Nhật trong read khớp 1 chữ bất kỳ."""
    if len(read) != len(cand):
        return False
    return all(a == b or not jis_ok(a) for a, b in zip(read, cand))


def strip_p(t):
    return norm_text(t).strip('。、．.,，')


def fuzzy_find(out, piece):
    """Cụm DUY NHẤT trong câu dài bằng piece và khác piece đúng 1 chữ (bỏ qua dấu cách)."""
    flat = [(i, c) for i, c in enumerate(out) if not c.isspace()]
    p = [c for c in piece if not c.isspace()]
    hits = []
    for k in range(len(flat) - len(p) + 1):
        win = flat[k:k + len(p)]
        if sum(c != q for (_, c), q in zip(win, p)) == 1:
            hits.append(out[win[0][0]:win[-1][0] + 1])
    return hits[0] if len(hits) == 1 else None


def norm_text(t):
    return re.sub(r'\s+', '', t).replace('(', '（').replace(')', '）').replace('.', '．')


def clean_page(img, ink, rows, mh):
    """Ảnh sạch cho lượt đọc 2: chỉ giữ mực tối (bỏ chữ nền, viền màu) và xoá vạch gạch chân."""
    keep = cv2.dilate(ink, np.ones((5, 5), np.uint8)) > 0   # giữ viền mờ quanh nét
    clean = np.full_like(img, 255)
    clean[keep] = img[keep]
    from frames import glyph_height, line_mask
    gh = glyph_height(ink)       # xoá đường kẻ (khung, kẻ bảng, gạch chân) nhưng GIỮ nét ngang của 一 二 三
    clean[cv2.dilate(line_mask(ink, gh).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 255
    from frames import find_frames, erase_frames
    erase_frames(clean, find_frames(ink))
    for r in rows:
        # chỉ xoá vạch được nhận là GẠCH CHÂN thật (nằm dưới chân chữ, không dính nét chữ)
        y0 = int(r['bottom'] - 0.35 * mh); y1 = int(r['bottom'] + 0.3 * mh)
        segs = underline_segments(ink, r, mh)
        band = ink[y0:y1]
        for yy in range(band.shape[0]):
            xs = np.flatnonzero(np.diff(np.concatenate([[0], band[yy], [0]])))
            for a, b in zip(xs[::2], xs[1::2]):
                if b - a >= 0.7 * mh and any(a >= s0 - 4 and b <= s1 + 4 for s0, s1 in segs):
                    clean[y0 + yy, a:b] = 255
    return clean


def read_symbols(sub, mh):
    """Nhận ký hiệu ô trống theo hình dạng: '-' là nét dẹt ngang, '★' là khối gần vuông.
    Chỉ trả kết quả khi MỌI cụm mực trong vùng đều là một trong hai loại."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(sub.astype(np.uint8))
    out = []
    for i in sorted(range(1, n), key=lambda i: st[i][0]):
        x, y, w, h, a = st[i]
        if a < 8:
            continue  # chấm nhiễu
        if w >= 2.2 * h and h <= 0.2 * mh and 0.12 * mh <= w <= 0.8 * mh:
            out.append('-')
        elif 0.75 <= w / h <= 1.35 and 0.3 * mh <= h <= 0.8 * mh and 0.35 <= a / (w * h) <= 0.65:
            out.append('★')
        else:
            return None
    return ''.join(out) if out else None


CHAR_W = lambda c: 0.15 if c in '.,．，、。・:;' else (0.85 if is_wide(c) else (0 if c.isspace() else 0.5))


def account_ink(rows, ruby, clean, mh, Ww, figs, log):
    """'Mọi vết mực phải được giải thích':
    (a) mực không thuộc hộp chữ OCR nào / ảnh minh hoạ / viền trang -> cắt ra đọc lại;
        đọc được thì thêm dòng, không đọc được thì trả về vùng 'không giải thích được'.
    (b) hộp chữ có bề rộng mực lớn hơn hẳn số chữ OCR trả về (OCR làm rơi chữ) -> đọc lại 2x.
    Trả về danh sách vùng không đọc được [(x0,y0,x1,y1)]."""
    H = clean.shape[0]
    cink = ink_mask(clean)
    # đo bề rộng mực bằng ngưỡng TỐI (lõi nét): mặt nạ hai ngưỡng giữ cả viền xám nên nét dày hơn,
    # đề font chữ giãn rộng bị tưởng là "OCR làm rơi chữ"
    core = (cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY) < 160).astype(np.uint8)
    lines = [l for r in rows for l in r['ls']]
    # (b) hộp chữ thiếu chữ
    for l in lines:
        x0, y0, x1, y1 = l['box']; h = y1 - y0
        cols = core[y0:y1, x0:x1].max(axis=0).sum() if x1 > x0 else 0
        est = sum(CHAR_W(c) for c in l['text']) * h
        if cols > 1.3 * est + 0.35 * h:
            big = cv2.resize(clean[max(0, y0 - 8):y1 + 8, max(0, x0 - 8):x1 + 8], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            t, s = read_crop(big)
            t = t.strip()
            est2 = sum(CHAR_W(c) for c in t) * h
            if s >= 0.9 and len(norm_text(t)) > len(norm_text(l['text'])) and cols <= 1.3 * est2 + 0.35 * h:
                log.append(('OCR làm rơi chữ, đọc lại 2x:', l['text'], '->', t, round(s, 3)))
                l['text'], l['score'] = t, max(s, 0.95)
            else:
                log.append(('hộp chữ có vẻ thiếu chữ, đọc lại vẫn không đủ:', l['text'], t, round(s, 3)))
                l['score'] = min(l['score'], 0.5)
                l['missing'] = True
    # (a) mực chưa được giải thích
    m = cink.copy()
    m[:int(0.075 * H)] = 0; m[int(0.925 * H):] = 0
    m[:, :int(0.07 * Ww)] = 0; m[:, int(0.93 * Ww):] = 0
    for l in lines + list(ruby):
        x0, y0, x1, y1 = l['box']
        m[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6] = 0
    for f in figs:
        m[f[1]:f[3], f[0]:f[2]] = 0
    # bỏ nét mảnh nằm ngang (gạch chân, đường kẻ bảng) và chấm nhiễu
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if h < 0.22 * mh or a < 25:
            m[lab == i] = 0
    blob = cv2.dilate(m, np.ones((int(0.35 * mh), int(0.6 * mh)), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(blob)
    unread = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if m[y:y + h, x:x + w].sum() < 150 or h < 0.4 * mh:
            continue
        # vùng cao nhiều dòng -> cắt theo khoảng trắng giữa các dòng
        prof = m[y:y + h, x:x + w].max(axis=1)
        bands, start = [], None
        for yy, v in enumerate(list(prof) + [0]):
            if v and start is None: start = yy
            if not v and start is not None:
                if yy - start >= 0.3 * mh: bands.append((start, yy))
                start = None
        for b0, b1 in bands:
            by0, by1 = y + b0, y + b1
            xs = np.flatnonzero(m[by0:by1, x:x + w].max(axis=0))
            bx0, bx1 = x + xs.min(), x + xs.max() + 1
            if bx1 - bx0 < 0.12 * mh:
                continue      # mảnh đường kẻ dọc mảnh (khung đoạn văn), không phải chữ
            # chữ nhỏ nằm sát ngay trên một dòng chữ = furigana (ルビ) của dòng đó, không phải chữ bỏ sót
            if by1 - by0 <= 0.6 * mh and any(
                    by1 - 0.15 * mh <= l['box'][1] <= by1 + 0.45 * mh
                    and min(bx1, l['box'][2]) - max(bx0, l['box'][0]) > 0.5 * (bx1 - bx0)
                    for l in lines):
                log.append(('furigana trên dòng chữ, không tính là chữ bỏ sót', (int(bx0), int(by0), int(bx1), int(by1))))
                continue
            t, s = read_crop(clean[max(0, by0 - 8):by1 + 8, max(0, bx0 - 8):bx1 + 8])
            t = t.strip()
            if t and s < 0.9 and os.environ.get('GLYPH', '1') == '1':
                # đọc lại chưa chắc -> so ảnh từng chữ; xác nhận được cả mảnh thì nhận
                import glyphcheck
                if getattr(account_ink, '_cid', None) is not clean:
                    account_ink._ci, account_ink._cid = ink_mask(clean), clean
                tg, stg, _ = glyphcheck.restore_line({'text': t, 'box': [int(bx0), int(by0), int(bx1), int(by1)]},
                                                     account_ink._ci)
                if stg == 'verified':
                    log.append(('so ảnh xác nhận mảnh mực đọc lại:', t, '->', tg, round(s, 3)))
                    t, s = tg, 0.95
            if t and s >= 0.9:
                nl = {'text': t, 'score': s, 'box': [int(bx0), int(by0), int(bx1), int(by1)], 'added': True}
                cy = (by0 + by1) / 2
                row = next((r for r in rows if abs(r['cy'] - cy) < 0.45 * mh), None)
                if row is None:
                    row = {'cy': cy, 'ls': [], 'top': by0, 'bottom': by1, 'x0': bx0, 'x1': bx1}
                    rows.append(row)
                row['ls'] = sorted(row['ls'] + [nl], key=lambda l: l['box'][0])
                row['top'] = min(row['top'], by0); row['bottom'] = max(row['bottom'], by1)
                row['x0'] = row['ls'][0]['box'][0]; row['x1'] = row['ls'][-1]['box'][2]
                log.append(('đọc bổ sung vùng mực OCR bỏ sót:', t, round(s, 3)))
            else:
                unread.append((int(bx0), int(by0), int(bx1), int(by1)))
                log.append(('vùng mực không đọc được', (int(bx0), int(by0), int(bx1), int(by1)), t, round(s, 3)))
    # hàng có mảnh vừa đọc bổ sung: đọc lại CẢ hàng một lần. Nếu lần đọc cả hàng chứa đủ mọi
    # chữ của các mảnh (theo đúng thứ tự) thì dùng nó (giữ được dấu câu / khoảng cách giữa mảnh).
    for r in rows:
        if not any(l.get('added') for l in r['ls']):
            continue
        x0 = min(l['box'][0] for l in r['ls']); x1 = max(l['box'][2] for l in r['ls'])
        y0 = min(l['box'][1] for l in r['ls']); y1 = max(l['box'][3] for l in r['ls'])
        t, s_ = read_crop(clean[max(0, y0 - 8):y1 + 8, max(0, x0 - 8):x1 + 8])
        joined = ''.join(norm_text(l['text']) for l in r['ls'])
        it = iter(norm_text(t))
        if s_ >= 0.9 and all(c in it for c in joined):
            log.append(('đọc lại cả hàng sau khi ghép mảnh:', ' | '.join(l['text'] for l in r['ls']), '->', t.strip(), round(s_, 3)))
            r['ls'] = [{'text': t.strip(), 'score': s_, 'box': [x0, y0, x1, y1], 'added': True}]
        else:
            for l in r['ls']:
                if l.get('added'):
                    l['score'] = min(l['score'], 0.94)   # ghép mảnh chưa được xác nhận -> không tin tuyệt đối
            log.append(('hàng ghép mảnh chưa xác nhận được:', ' | '.join(l['text'] for l in r['ls']), t.strip(), round(s_, 3)))
    rows.sort(key=lambda r: r['cy'])
    return unread


def second_pass(rows, clean, mh, Ww, figs, log):
    """Lượt đọc 2 trên ảnh sạch: đọc lại dòng kém tin cậy + đọc khoảng trống OCR bỏ sót."""
    cink = ink_mask(clean)
    H = clean.shape[0]
    pad = 8
    for r in rows:
        # 1. khoảng trống trong hàng (và phía phải hàng) mà vẫn có mực
        edges = [int(0.07 * Ww)] + [v for l in r['ls'] for v in (l['box'][0], l['box'][2])] + [int(0.93 * Ww)]
        y0, y1 = int(r['top']), int(r['bottom'])
        added = []
        for k in range(0, len(edges), 2):
            gx0, gx1 = edges[k] + 6, edges[k + 1] - 6
            if gx1 - gx0 < 1.0 * mh or k == 0:
                continue
            if any(f[0] < gx1 and f[2] > gx0 and f[1] < y1 and f[3] > y0 for f in figs):
                continue
            sub = cink[y0:y1, gx0:gx1]
            if sub.sum() < 60:   # ít hơn ~60 điểm mực: chỉ là nhiễu
                continue
            ys, xs_ = np.nonzero(sub)
            bx0, bx1 = gx0 + xs_.min(), gx0 + xs_.max()
            crop = clean[max(0, y0 - pad):min(H, y1 + pad), max(0, bx0 - pad):bx1 + pad]
            t, s = read_crop(crop)
            if not (t.strip() and s >= 0.9):
                sym = read_symbols(sub, mh)   # OCR không đọc được ký hiệu đứng riêng -> nhận theo hình dạng
                if sym:
                    t, s = sym, 0.96
                else:
                    log.append(('khoảng trống có mực nhưng không đọc được', t, round(s, 3)))
            row_ja = any(is_wide(c) for l in r['ls'] for c in l['text'])
            if t.strip() and s >= 0.9 and row_ja and re.fullmatch(r'[A-Za-z]', t.strip()):
                # dòng tiếng Nhật mà khoảng trống chỉ đọc ra 1 chữ Latin: rất hay là dấu ngoặc ( ) đọc nhầm
                sym = read_symbols(sub, mh)
                log.append(('khoảng trống đọc ra 1 chữ Latin lẻ trong dòng tiếng Nhật, không tin', t, round(s, 3)))
                t, s = (sym, 0.96) if sym else ('', 0)
                if not t:
                    r.setdefault('unread_gaps', []).append((int(bx0), y0, int(bx1), y1))
            if t.strip() and s >= 0.9:
                added.append({'text': t.strip(), 'score': s, 'box': [int(bx0), y0, int(bx1), y1], 'added': True})
                log.append(('đọc bổ sung chỗ OCR bỏ sót', t.strip(), round(s, 3)))
        if added:
            r['ls'] = sorted(r['ls'] + added, key=lambda l: l['box'][0])
        # 2. dòng kém tin cậy: đọc thêm 2 lần trên ảnh sạch (lề khác nhau, phóng 1.5x)
        #    rồi lấy kết quả mà ÍT NHẤT 2/3 lần đọc giống nhau (bỏ qua dấu cách, kiểu ngoặc).
        for li, l in enumerate(r['ls']):
            if (l['score'] >= 0.95 and not RARE(l['text'])) or l.get('added'):
                continue
            x0, by0, x1, by1 = l['box']
            # lề ngang KHÔNG được lấn sang ô chữ bên cạnh (tránh đọc dính chữ của ô kế bên)
            left_nb = r['ls'][li - 1]['box'][2] if li > 0 else -10 ** 6
            right_nb = r['ls'][li + 1]['box'][0] if li + 1 < len(r['ls']) else 10 ** 6
            padL = int(max(0, min(2 * pad, (x0 - left_nb) / 2)))
            padR = int(max(0, min(2 * pad, (right_nb - x1) / 2)))
            c1 = clean[max(0, by0 - pad):by1 + pad, max(0, x0 - min(pad, padL)):x1 + min(pad, padR)]
            c2 = clean[max(0, by0 - 2 * pad):by1 + 2 * pad, max(0, x0 - padL):x1 + padR]
            c2 = cv2.resize(c2, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            reads = [(l['text'].strip(), l['score'])] + [tuple(v) for v in (read_crop(c1), read_crop(c2))]
            votes = {}
            # Ứng viên = các lần đọc chỉ gồm chữ có trong bảng mã Nhật. Mỗi lần đọc bỏ phiếu cho
            # ứng viên trùng nó; chữ ngoài bảng mã Nhật (vd 每 thay cho 毎) coi như "chữ bất kỳ".
            for t, sc in reads:
                if not t.strip() or not jis_ok(t):
                    continue
                k = norm_text(t)
                if k in votes:
                    continue
                votes[k] = []
                for t2, sc2 in reads:
                    if wild_match(norm_text(t2), k):
                        votes[k].append((sc2, t.strip()))
            if not votes:
                log.append(('vẫn không chắc', [(t, round(sc, 3)) for t, sc in reads]))
                continue
            best_key, best = max(votes.items(), key=lambda kv: (len(kv[1]), max(v[0] for v in kv[1])))
            top_sc = max(v[0] for v in best)
            if len(best) >= 2 and (top_sc >= 0.9 or (top_sc >= 0.85 and not RARE(max(best)[1]))):
                text = max(best)[1]
                # phần chữ THÊM ở hai đầu mà trùng chữ của ô bên cạnh -> do lấn sang ô kế bên, cắt bỏ
                o = norm_text(l['text'])
                nt = norm_text(text)
                if len(nt) > len(o):
                    nxt_t = norm_text(r['ls'][li + 1]['text']) if li + 1 < len(r['ls']) else ''
                    prv_t = norm_text(r['ls'][li - 1]['text']) if li > 0 else ''
                    for k in (2, 1):
                        if nt.startswith(o) and len(nt) - len(o) == k and nxt_t.startswith(nt[-k:]):
                            text = text[:len(text) - k] if text.endswith(nt[-k:]) else text
                            log.append(('cắt phần lấn sang ô bên phải', nt[-k:])); break
                        if nt.endswith(o) and len(nt) - len(o) == k and prv_t.endswith(nt[:k]):
                            text = text[k:] if text.startswith(nt[:k]) else text
                            log.append(('cắt phần lấn sang ô bên trái', nt[:k])); break
                log.append(('%d/3 lần đọc giống nhau' % len(best), l['text'], '->' if norm_text(l['text']) != best_key else '=', text,
                            [round(v[1], 3) for v in reads]))
                l['text'], l['score'] = text, max(top_sc, 0.95)
            else:
                log.append(('vẫn không chắc', [(t, round(sc, 3)) for t, sc in reads]))
    return rows


def build_scan_questions(pages, ocr_dir, out_dir):
    qs, warnings = [], []
    section, sec_open = None, False
    prev_id = None
    last_page = None
    for pno in pages:
        if last_page is not None and pno != last_page + 1:
            section, prev_id = None, None   # thử nghiệm bỏ qua trang giữa -> không kế thừa mục cũ
        last_page = pno
        lines = json.load(open(os.path.join(ocr_dir, f'p{pno:02d}.json'), encoding='utf8'))
        img, ink, rows, figs, mh = parse_scan_page(os.path.join(ocr_dir, f'p{pno:02d}.png'), lines)
        Ww = img.shape[1]
        clean = clean_page(img, ink, rows, mh)
        if SECOND_PASS:
            log = []
            second_pass(rows, clean, mh, Ww, figs, log)
            for e in log: print('  p%d' % pno, *e)
        read_img = clean if SECOND_PASS else img
        blocks = []
        for r in rows:
            t = ''.join(l['text'] for l in r['ls']).translate(FW)
            if re.match(r'^問題\s?\d', t):
                section = row_text(r, [], mh, ink, read_img); sec_open = True
                blocks.append({'type': 'section', 'row': r}); continue
            m = re.match(r'^(\d{1,2})\s?[.．。]\s*', t)
            if m:
                sec_open = False
                blocks.append({'type': 'q', 'id': int(m.group(1)), 'rows': [r], 'opts': [], 'section': section})
                continue
            if sec_open and blocks:
                section += ''.join(l['text'] for l in r['ls']); continue
            is_opt = re.match(r'^[A-D][.．]', t) or len(re.findall(r'(?:^|[^A-Za-z])[A-D](?=[.．]|[^\x00-\x7f])', t)) >= 2
            if is_opt and blocks and blocks[-1]['type'] == 'q':
                blocks[-1]['opts'].append(r); continue
            if blocks and blocks[-1]['type'] == 'q' and not blocks[-1]['opts']:
                blocks[-1]['rows'].append(r); continue
            if blocks and blocks[-1]['type'] == 'q' and len(t) > 2:
                blocks[-1].setdefault('stray', []).append(t)
        qblocks = [b for b in blocks if b['type'] == 'q']
        for i, b in enumerate(qblocks):
            top = b['rows'][0]['top']
            nxt = qblocks[i + 1]['rows'][0]['top'] if i + 1 < len(qblocks) else None
            # ảnh nằm trong khối câu này
            b_figs = [f for f in figs if f[1] > top and (nxt is None or f[3] < nxt)]
            last = max([r['bottom'] for r in b['rows'] + b['opts']] + [f[3] for f in b_figs])
            y0 = int(top - 0.35 * mh); y1 = int(last + 0.35 * mh)
            x0, x1 = int(0.07 * Ww), int(0.93 * Ww)
            crop = f'crop_p{pno}_q{b["id"]}.png'
            cv2.imwrite(os.path.join(out_dir, crop), img[y0:y1, x0:x1])
            fig_files = []
            for k, f in enumerate(b_figs):
                fn = f'fig_p{pno}_q{b["id"]}_{k}.png'
                cv2.imwrite(os.path.join(out_dir, fn), img[f[1]:f[3], f[0]:f[2]])
                fig_files.append(fn)
            # chữ câu hỏi
            stem_parts = []
            for j, r in enumerate(b['rows']):
                segs = underline_segments(ink, r, mh)
                stem_parts.append(row_text(r, segs, mh, ink, read_img))
            stem = '\n'.join(stem_parts)
            stem = re.sub(r'^\s*(\[\[)?\d{1,2}(\]\])?\s*(\[\[)?[.．。](\]\])?\s*', '', stem)
            uncertain = any(r.get('uncertain') for r in b['rows'])
            # phương án
            opt_text = []
            for r in b['opts']:
                for l in r['ls']:
                    for part in re.split(r'(?<=.)(?=[A-D][.．]?(?=[^\x00-\x7f]))', l['text'].translate(FW)):
                        opt_text.append((part, l['score']))
            opts, labels = [], []
            for part, sc in opt_text:
                mm = re.match(r'^([A-D])[.．]?\s*(.+)$', part.strip())
                if mm:
                    labels.append(mm.group(1)); opts.append(mm.group(2).strip())
            scores = [l['score'] for r in b['rows'] + b['opts'] for l in r['ls']]
            reasons = []
            if labels != ['A', 'B', 'C', 'D']:
                reasons.append('đọc được %d/4 phương án' % len(set(labels)))
            low = min(scores)
            if low < 0.95:
                reasons.append('có chữ độ tin cậy thấp (%.2f)' % low)
            if prev_id is not None and b['id'] != prev_id + 1:
                reasons.append('số câu không liên tục (%s → %s)' % (prev_id, b['id']))
            if b.get('stray'):
                reasons.append('có dòng chữ lạ: ' + ' / '.join(b['stray']))
            sec = (b['section'] or '')
            if '★' in sec or '★' in stem:
                n_slots = stem.count('〔_〕') + stem.count('〔★〕')
                if n_slots != 4 or stem.count('〔★〕') != 1:
                    reasons.append('xác định được %d/4 ô trống ★' % n_slots)
            if ('ことば' in sec) and '[[' not in stem:
                reasons.append('không tìm thấy từ gạch chân')
            if uncertain:
                dbg = [d for r in b['rows'] for d in r.get('u_debug', [])]
                reasons.append('không xác định chắc chắn chữ nào được gạch chân %s' % dbg)
            prev_id = b['id']
            q = {'id': b['id'], 'section': clean_section(sec), 'question': stem, 'options': opts,
                 'images': fig_files, 'crop': crop, 'mode': 'image' if reasons else 'text', 'reasons': reasons}
            qs.append(q)
    # Cả mục là dạng ★ nếu có câu nào trong mục có ô ★ -> mọi câu của mục phải đủ 4 ô
    star_secs = {q['section'] for q in qs if '〔★〕' in q['question']}
    for q in qs:
        if q['section'] in star_secs and q['section'] and '〔★〕' not in q['question']:
            q['reasons'].append('mục dạng ★ nhưng không tìm thấy ô trống')
            q['mode'] = 'image'
    return qs


def clean_section(s):
    s = s.replace('(', '（').replace(')', '）')
    s = re.sub(r'^(問題\s?\d)', r'\1　', s)
    return s


# ---------------------------------------------------------------- đáp án
def parse_answer_pdf(path):
    import pdfplumber
    keys, part = {}, 0
    for pg in pdfplumber.open(path).pages:
        lines = (pg.extract_text() or '').split('\n')
        for i, ln in enumerate(lines):
            if '文法' in ln and '●' in ln:
                part = 1
            if '聴解' in ln and '●' in ln:
                part = 2
            nums = re.findall(r'\d+', re.sub(r'^問題\s?\d', '', ln))
            if nums and i + 1 < len(lines):
                ans = lines[i + 1].split()
                if len(ans) == len(nums) and all(a in '1234' for a in ans) and int(nums[0]) > 0:
                    for n, a in zip(nums, ans):
                        keys.setdefault((part, int(n)), int(a))
    return keys


# ---------------------------------------------------------------- HTML mô phỏng
def md(t):
    import html
    t = html.escape(t)
    t = re.sub(r'\{([^|{}]+)\|([^{}]+)\}', r'<ruby>\1<rt>\2</rt></ruby>', t)
    t = re.sub(r'\[\[(.+?)\]\]', r'<u>\1</u>', t)
    t = t.replace('〔★〕', '<span class="slot">★</span>').replace('〔_〕', '<span class="slot"></span>')
    return t


def render_html(title, groups, out):
    """groups: [(tiêu đề nhóm, mô tả, [questions], img_base)]"""
    body = []
    for gtitle, gdesc, qs, base in groups:
        body.append(f'<div class="group"><div class="gtitle">{gtitle}</div><div class="gdesc">{gdesc}</div>')
        prev = {}
        for q in qs:
            if q.get('section') and q['section'] != prev.get('section'):
                body.append(f'<h3 class="sec">{md(q["section"])}</h3>')
            if q.get('passage') and q['passage'] != prev.get('passage'):
                ps = ''.join(f'<p>{md(p)}</p>' for p in q['passage'].split('\n\n'))
                body.append(f'<div class="passage">{ps}</div>')
            prev = q
            ans = q.get('answer')
            if q['mode'] == 'image':
                body.append(f'''<article class="card"><div class="head"><div class="num">{q["id"]}</div>
<div class="badge warn">Hiện bằng ảnh gốc — {"; ".join(q["reasons"])}</div></div>
<img class="crop" src="{base}{q["crop"]}"><div class="opts">''' +
                            ''.join(f'<button class="opt{" ok" if ans == i + 1 else ""}"><span class="lab">{"ABCD"[i] if q.get("abcd") else i + 1}</span></button>' for i in range(4)) +
                            '</div></article>')
                continue
            imgs = ''.join(f'<img class="fig" src="{base}{f}">' for f in q.get('images', []))
            opts = ''.join(f'<button class="opt{" ok" if ans == i + 1 else ""}"><span class="lab">{"ABCD"[i] if q.get("abcd") else i + 1}</span><span>{md(o)}</span></button>'
                           for i, o in enumerate(q['options']))
            qtext = md(q['question']) if q['question'] else '<span class="muted">Chọn từ thích hợp cho ô (%d) trong đoạn văn.</span>' % q['id']
            body.append(f'<article class="card"><div class="head"><div class="num">{q["id"]}</div><h4>{qtext}</h4></div>{imgs}<div class="opts">{opts}</div></article>')
        body.append('</div>')
    html_doc = f'''<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
:root{{--bg:hsl(220 20% 97%);--fg:hsl(222 47% 11%);--card:#fff;--primary:hsl(226 71% 40%);--border:hsl(220 20% 90%);--sec:hsl(220 25% 95%);--muted:hsl(220 10% 46%);--ok:hsl(152 60% 42%)}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font-family:"Segoe UI","Yu Gothic UI","Meiryo",system-ui,sans-serif}}
.wrap{{max-width:768px;margin:0 auto;padding:24px 16px 60px}}
.group{{margin-bottom:40px}}.gtitle{{font-size:20px;font-weight:700}}.gdesc{{color:var(--muted);font-size:13px;margin:4px 0 16px}}
.sec{{font-size:14px;font-weight:700;color:var(--primary);line-height:1.7;margin:22px 0 12px}}
.passage{{white-space:pre-line;border:1px solid var(--border);background:var(--sec);border-radius:16px;padding:16px;font-size:14px;line-height:2.1;margin-bottom:16px}}
.passage p{{margin:0 0 10px}}
.card{{background:var(--card);border:1px solid var(--border);border-radius:24px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px hsl(222 47% 11% / .06)}}
.head{{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px}}
.num{{flex:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,hsl(226 71% 40%),hsl(226 80% 60%));color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center}}
h4{{margin:0;padding-top:6px;font-size:15px;font-weight:500;line-height:2;white-space:pre-line}}
u{{text-underline-offset:4px;text-decoration-thickness:1.5px}}
rt{{font-size:.6em;color:var(--muted)}}
.slot{{display:inline-block;min-width:3.2em;border-bottom:1.5px solid var(--fg);text-align:center;margin:0 .25em;line-height:1.3}}
.opts{{display:grid;gap:8px;grid-template-columns:1fr 1fr}}@media(max-width:560px){{.opts{{grid-template-columns:1fr}}}}
.opt{{display:flex;gap:12px;align-items:center;border:1px solid var(--border);background:#fff;border-radius:16px;padding:12px 16px;font:inherit;font-size:14px;text-align:left;color:var(--fg)}}
.opt.ok{{border-color:var(--ok);background:hsl(152 60% 42% / .08)}}
.lab{{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid hsl(220 10% 46% / .3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}}
.opt.ok .lab{{background:var(--ok);border-color:var(--ok);color:#fff}}
.fig{{display:block;margin:0 auto 16px;max-height:320px;max-width:100%;border:1px solid var(--border);border-radius:12px}}
.crop{{display:block;width:100%;border:1px solid var(--border);border-radius:12px;margin-bottom:12px}}
.badge.warn{{font-size:12px;color:hsl(30 80% 30%);background:hsl(38 92% 50% / .14);border-radius:10px;padding:8px 10px;line-height:1.5}}
.muted{{color:var(--muted)}}
</style></head><body><div class="wrap">{"".join(body)}</div></body></html>'''
    open(out, 'w', encoding='utf8').write(html_doc)


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'text':
        pdf, pages, ans, out_dir = sys.argv[2], [int(x) for x in sys.argv[3].split(',')], sys.argv[4], sys.argv[5]
        os.makedirs(out_dir, exist_ok=True)
        items, doc = parse_text_pdf(pdf, pages, out_dir)
        qs = build_text_questions(items, 595)
        keys = parse_answer_pdf(ans) if ans != '-' else {}
        part = int(sys.argv[6]) if len(sys.argv) > 6 else 0
        for q in qs:
            q['mode'] = 'text'; q['answer'] = keys.get((part, q['id']))
            if len(q['options']) != 4:
                q['mode'] = 'image'; q['reasons'] = ['đọc được %d/4 phương án' % len(q['options'])]
        json.dump(qs, open(os.path.join(out_dir, 'questions.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        print(json.dumps(qs, ensure_ascii=False, indent=1)[:6000])
    else:
        pdf, pages, ocr_dir, out_dir = sys.argv[2], [int(x) for x in sys.argv[3].split(',')], sys.argv[4], sys.argv[5]
        os.makedirs(out_dir, exist_ok=True)
        qs = build_scan_questions(pages, ocr_dir, out_dir)
        for q in qs: q['abcd'] = True
        json.dump(qs, open(os.path.join(out_dir, 'questions.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        for q in qs:
            print(q['id'], q['mode'], q['reasons'], '|', q['question'], '|', q['options'], q['images'])
