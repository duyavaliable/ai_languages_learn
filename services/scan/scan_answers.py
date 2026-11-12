"""Đọc bảng đáp án dạng ảnh (sau OCR): hàng số câu + hàng đáp án ngay dưới, ghép theo cột.
Mỗi tiêu đề ('Đáp án ...', '正答', '問題 1'...) mở một bảng mới.

Bất biến bắt buộc (không đạt -> KHÔNG dùng bảng đó, báo admin):
  - số câu trong bảng liền nhau 1..N, không trùng,
  - mỗi số câu có đúng một đáp án.
"""
import re, json, os, statistics, unicodedata
from build import FW

HEAD_RE = re.compile(r'dap\s*an|正答|解答|問題\s*\d|もんだい\s*\d|answer\s*key|part\s*\d', re.I)


def _plain(s):
    """Bỏ dấu tiếng Việt (OCR hay rơi dấu: 'Dáp án', 'Đap an')."""
    s = s.replace('Đ', 'D').replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


PART_RE = re.compile(r'聴\s*解|読\s*解|文\s*法|語\s*彙|文\s*字|listening|reading', re.I)


def lines_from_pdf(pdf_path, pno):
    """Bảng đáp án có LỚP CHỮ: lấy từng từ kèm toạ độ (phóng 4 lần cho cùng thang với ảnh OCR)."""
    import pymupdf
    page = pymupdf.open(pdf_path)[pno - 1]
    return [{'text': w[4], 'score': 1.0, 'box': [int(4 * w[0]), int(4 * w[1]), int(4 * w[2]), int(4 * w[3])]}
            for w in page.get_text('words')]


def parse(ocr_dir, pno, verbose=False):
    lines = json.load(open(os.path.join(ocr_dir, f'p{pno:02d}.json'), encoding='utf8'))
    return parse_lines(lines, verbose)


def parse_lines(lines, verbose=False, part=None):
    """part: tên phần thi đang ở (vd '聴解') — tiêu đề phần ('●聴解') đổi phần cho các bảng phía sau."""
    mh = statistics.median(l['box'][3] - l['box'][1] for l in lines)
    cells = []
    for l in lines:
        toks = l['text'].translate(FW).split()
        x0, y0, x1, y1 = l['box']
        w = (x1 - x0) / max(1, len(toks))
        for i, t in enumerate(toks):
            cx = x0 + w * (i + 0.5)
            m2 = re.fullmatch(r'(\d{1,2})([A-D1-4])', t)
            if m2 and (y1 - y0) > 1.6 * mh:
                # OCR gộp 2 ô TRÊN-DƯỚI (số câu + đáp án) thành một hộp cao gấp đôi -> tách lại
                cells.append({'t': m2.group(1), 'x': cx, 'y': y0 + (y1 - y0) / 4, 's': l['score'], 'head': m2.group(1)})
                cells.append({'t': m2.group(2), 'x': cx, 'y': y1 - (y1 - y0) / 4, 's': l['score'], 'head': m2.group(2)})
                continue
            cells.append({'t': t, 'x': cx, 'y': (y0 + y1) / 2, 's': l['score'], 'head': l['text']})
    cells.sort(key=lambda c: c['y'])
    rows = []
    for c in cells:   # so với tâm TRUNG BÌNH của hàng, tránh trôi dần sang hàng dưới
        if rows and abs(sum(x['y'] for x in rows[-1]) / len(rows[-1]) - c['y']) < 0.5 * mh:
            rows[-1].append(c)
        else:
            rows.append([c])

    tables, cur = [], None
    NUM = re.compile(r'^(\d{1,2})(?:番|ばん)?([A-D])?$')      # '12', '1番', '2B' (số dính đáp án)
    ANS = re.compile(r'^[A-D1-4]$')
    used = set()
    for i, r in enumerate(rows):
        if i in used:
            continue                    # hàng đáp án đã ghép với hàng số câu phía trên
        r.sort(key=lambda c: c['x'])
        txt = _plain(' '.join(dict.fromkeys(c['head'] for c in r)))
        pm = PART_RE.search(''.join(c['head'] for c in r))
        if pm and not HEAD_RE.search(txt) and not any(NUM.match(c['t']) for c in r):
            part = re.sub(r'\s', '', pm.group(0)); cur = None
            continue
        if HEAD_RE.search(txt) and not all(NUM.match(c['t']) for c in r):
            # tiêu đề bảng có thể nằm CÙNG HÀNG với dãy số câu ('問題１ 例 1 2 3 ...' ở bảng có lớp chữ)
            head = [c for c in r if not (NUM.match(c['t']) or c['t'] in ('例', 'れい'))]
            rest = [c for c in r if c not in head]
            cur = {'title': ' '.join(dict.fromkeys(c['head'] for c in head)).strip(), 'keys': {}, 'dup': [], 'low': [],
                   'part': part}
            tables.append(cur)
            if len(rest) < 3:
                continue
            r = rest
        nums = [NUM.match(c['t']) for c in r]
        if cur is None or len(r) < 3 or sum(bool(m) for m in nums) < 0.8 * len(r):
            continue
        ans = sorted([c for c in rows[i + 1] if ANS.match(c['t'])], key=lambda c: c['x']) if i + 1 < len(rows) else []
        if ans:
            used.add(i + 1)
        for c, m in zip(r, nums):
            if not m:
                continue
            n = int(m.group(1))
            a = min(ans, key=lambda a: abs(a['x'] - c['x'])) if ans else None
            if a is not None and abs(a['x'] - c['x']) <= 1.2 * mh:
                val, sc = a['t'], a['s']
            elif m.group(2):            # OCR gộp ô đáp án vào ô số: '2B'
                val, sc = m.group(2), c['s']
            else:
                continue
            if n in cur['keys']:
                cur['dup'].append(n)
            cur['keys'][n] = val
            if sc < 0.95:
                cur['low'].append(n)

    tables = [t for t in tables if t['keys']]
    for t in tables:
        ks = sorted(t['keys'])
        probs = []
        if t['dup']:
            probs.append('số câu lặp: %s' % t['dup'])
        miss = sorted(set(range(1, ks[-1] + 1)) - set(ks))
        if miss:
            probs.append('thiếu số câu: %s' % miss)
        t['problems'] = probs
        t['ok'] = not probs
        if verbose:
            print('  bảng đáp án "%s" (phần %s): %d câu %s %s' % (t['title'][:40], t.get('part'), len(ks), 'OK' if t['ok'] else 'LỖI', probs))
    return tables
