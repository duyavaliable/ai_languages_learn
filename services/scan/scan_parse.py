"""Bộ dựng câu hỏi TỔNG QUÁT cho PDF scan (sau OCR lượt 1).

Không gắn với một mẫu đề: tự nhận kiểu đánh số câu, kiểu nhãn phương án
(A-E / 1-4 / ①-④), số phương án, đoạn văn, tiêu đề mục, furigana.
  python scan_parse.py <ocr_dir> <pages> <out_dir>
"""
import sys, os, re, json, statistics
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, cv2
import build
from build import (FW, KANJI, ink_mask, underline_segments, char_positions, row_text, read_crop,
                   clean_page, second_pass, clean_section, norm_text, account_ink)

SECTION_RE = re.compile(r'^(問題\s?\d|もんだい\s?\d|Questions?\s+\d|QUESTIONS?\s+\d|Part\s+\d|PART\s+\d)')
# mở ngoặc thì phải ĐÓNG NGOẶC ngay sau số: "(25)" là số câu, "(25ぷん)" là thời gian làm bài
QNUM_RE = re.compile(r'^\s*(?:[（(](?=\d{1,2}[)）]))?(\d{1,2})[)）]?(?:\s*[.．。:]\s*|\s+|(?=[^\d\s.．,、])|$)')
CIRCLED = '①②③④⑤'
# tiêu đề câu của ĐỀ NGHE: "1ばん" / "1番" đứng riêng một dòng (câu hỏi nằm trong băng, không in ra)
BARE_TITLE = re.compile(r'(問題|もんだい)[0-9０-９]{1,2}')
BAN_RE = re.compile(r'^\s*(\d{1,2})\s*(?:[ばぱ]ん|番)\s*$')
# số phương án nói trong lời hướng dẫn: "1から4の なかから" / "1から3の"
NOPT_RE = re.compile(r'([1-9１-９])\s*から\s*([2-9２-９])\s*の')
EMPTY_SECTIONS = []      # mục không in câu nào (đề nghe もんだい4): [(tiêu đề mục, trang)]


def n_options(section):
    m = NOPT_RE.search(section or '')
    if not m:
        return None
    a, b = (int(x.translate(str.maketrans('１２３４５６７８９', '123456789'))) for x in m.groups())
    return b - a + 1 if a == 1 else None


def rare_chars(t):
    """Kanji không thuộc JIS cấp 1 (gồm chữ giản thể Trung Quốc OCR hay nhầm sang, vd 气, 每)."""
    out = []
    for c in set(KANJI.findall(t)):
        try:
            b = c.encode('cp932'); v = b[0] * 256 + b[1]
            if not (0x889F <= v <= 0x9872):
                out.append(c)
        except UnicodeEncodeError:
            out.append(c)
    return sorted(out)


def voicing_suspects(texts):
    """Gọi kuromoji (dictcheck.cjs): cụm hiragana nghi đọc nhầm dấu ゛゜."""
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    r = subprocess.run(['node', os.path.join(here, 'dictcheck.cjs')], input=json.dumps(texts, ensure_ascii=False),
                       capture_output=True, text=True, encoding='utf-8')
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout else [[] for _ in texts]


def mixed_script(t):
    """Chữ Latin lẻ dính sát chữ Nhật (vd 毎H thay cho 毎日). Bỏ qua tên người nói 'A「'
    và chữ viết tắt >= 2 chữ cái (CD, ABC)."""
    out = []
    for m in re.finditer(r'(?<![A-Za-z])[A-Za-z](?![A-Za-z])', t):
        a, b = t[max(0, m.start() - 1):m.start()], t[m.end():m.end() + 1]
        if b in '「『' or re.match(r'[゠-ヿ]', b or ' '):   # A「 (người nói), Tシャツ
            continue
        if re.match(r'[぀-ヿ㐀-鿿]', a or ' ') or re.match(r'[぀-ヿ㐀-鿿]', b or ' '):
            out.append(a + m.group(0) + b)
    return out


FRAMES = []
DOC_TEXT = ''


def boxed_number(r, ink, mh):
    """Số câu nằm trong khung vuông (khung đã nhận ở bước OCR)."""
    for f in FRAMES:
        if f[2] >= r['x0'] - 2.2 * mh and f[0] <= r['x0'] + 1.0 * mh and f[1] < r['bottom'] and f[3] > r['top']:
            return True
    return False


def label_kind(t):
    t = t.lstrip()
    if re.match(r'^[A-E]\s*[「『]', t):
        return None          # A「...」 = người nói
    if re.match(r'^[（(]?[A-E][)）]?(?:[.．:]|\s|(?=[^\x00-\x7f]))', t):
        return 'abc'
    if t[:1] in CIRCLED:
        return 'circ'
    if re.match(r'^[1-4](?:[.．)]|\s|　|(?=[^\x00-\x7f\d]))', t):
        return 'num'
    return None


LABELS = {'abc': 'ABCDE', 'num': '1234', 'circ': CIRCLED}


def split_by_labels(text, kind, start=0):
    """Tách 'A.x B.y C.z' theo nhãn ĐÚNG THỨ TỰ (A rồi B rồi C...)."""
    labs = LABELS[kind]
    out, pos, want = [], 0, start
    starts = []
    while want < len(labs):
        L = re.escape(labs[want])
        if kind == 'abc':
            L = L + r'(?!\s*[「『])'          # không nhận 'A「' (người nói)
            pat = (r'(?:(?:(?<=^)|(?<=[\s　」。、.,)）]))[（(]?%s[)）]?(?:[.．:]\s*|\s+|(?=[^\x00-\x7f]))'
                   r'|(?<=[^\x00-\x7f])%s[.．]\s*'
                   r'|(?<=[a-z])%s(?=[a-z]{2}))' % (L, L, L))
        elif kind == 'num':
            pat = (r'(?:(?:(?<=^)|(?<=[\s　]))%s(?:[.．)]\s*|[\s　]+|(?=[^\x00-\x7f\d]))'
                   r'|(?<=[^\x00-\x7f\d])%s(?:[\s　]+|(?=[^\x00-\x7f\d　])))' % (L, L))
        else:
            pat = L
        m = re.compile(pat).search(text, pos)
        if not m:
            break
        starts.append((labs[want], m.start(), m.end()))
        pos = m.end(); want += 1
    for i, (lab, s, e) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        out.append((lab, text[e:end].strip(' 　')))
    return out


def find_furigana(lines, mh):
    """Tách dòng furigana (cao < 0.62 dòng thường, nằm ngay trên một dòng chữ)."""
    normal, ruby = [], []
    for l in lines:
        h = l['box'][3] - l['box'][1]
        if h < 0.75 * mh and re.fullmatch(r'[぀-ゟ゠-ヿ\s]+', l['text']):
            ruby.append(l)
        else:
            normal.append(l)
    for f in ruby:
        fx0, fy0, fx1, fy1 = f['box']
        below = [l for l in normal if 0 <= l['box'][1] - fy1 <= 0.6 * mh
                 and l['box'][0] < fx1 and l['box'][2] > fx0]
        f['target'] = min(below, key=lambda l: l['box'][1]) if below else None
    return normal, ruby


def attach_ruby(ruby, ink, mh):
    """Gắn furigana vào đúng cụm kanji nằm dưới; không chắc -> bỏ (không gắn sai)."""
    for f in ruby:
        l = f.get('target')
        if not l:
            continue
        mid0, mid1 = f['box'][0], f['box'][2]
        pos = char_positions(l, ink, mh)
        idx = [i for i, (c, x) in enumerate(pos) if KANJI.match(c) and mid0 - 0.3 * mh <= x <= mid1 + 0.3 * mh]
        if not idx or idx != list(range(idx[0], idx[-1] + 1)):
            continue
        # số kana phải hợp lý với số kanji (1-4 kana / kanji)
        n_k, n_r = len(idx), len(f['text'].strip())
        if not (n_k <= n_r <= 4 * n_k):
            continue
        l.setdefault('ruby', []).append((idx[0], n_k, f['text'].strip()))
        f['attached'] = True


def apply_ruby_markup(row, out):
    """Chèn {kanji|furigana} vào chuỗi đã có [[gạch chân]]."""
    for l in row['ls']:
        for start, n, rt in sorted(l.get('ruby', []), key=lambda r: -r[0]):
            base = l['text'][start:start + n]
            # vị trí theo thứ tự xuất hiện của base trong dòng
            k = l['text'][:start].count(base)
            idx, hit = -1, -1
            for _ in range(k + 1):
                idx = out.find(base, idx + 1)
                if idx < 0:
                    break
                hit = idx
            if hit >= 0:
                out = out[:hit] + '{%s|%s}' % (base, rt) + out[hit + n:]
    return out


def group_rows(lines, mh):
    lines = sorted(lines, key=lambda l: (l['box'][1] + l['box'][3]) / 2)
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
        r['x0'] = r['ls'][0]['box'][0]; r['x1'] = r['ls'][-1]['box'][2]
    return rows


def load_page(ocr_dir, pno):
    from build import parse_scan_page
    lines = json.load(open(os.path.join(ocr_dir, f'p{pno:02d}.json'), encoding='utf8'))
    img, ink, rows, figs, mh = parse_scan_page(os.path.join(ocr_dir, f'p{pno:02d}.png'), lines)
    # parse_scan_page đã lọc đầu/chân trang, chữ nền, chữ trong ảnh. Tách furigana rồi gom hàng lại.
    kept = [l for r in rows for l in r['ls']]
    normal, ruby = find_furigana(kept, mh)
    return img, ink, group_rows(normal, mh), figs, mh, ruby


def is_latin(t):
    letters = re.findall(r'[A-Za-z぀-ヿ一-鿿]', t)
    return bool(letters) and sum(c.isascii() for c in letters) > 0.6 * len(letters)


def join_lines(prev, nxt):
    if is_latin(prev + nxt):
        if prev.endswith('-') and nxt[:1].islower():
            return prev[:-1] + nxt
        return prev + ' ' + nxt
    return prev + nxt


def build(pages, ocr_dir, out_dir, consecutive=True):
    EMPTY_SECTIONS.clear()
    qs = []
    section, prev_id, passage, pending_passage = None, None, None, []
    pending_rows, passage_rows = [], None
    # Lượt 1: xử lý ảnh + đọc bổ sung từng trang
    pdata = []
    for pno in pages:
        img, ink, rows, figs, mh, ruby = load_page(ocr_dir, pno)
        Ww = img.shape[1]
        clean = clean_page(img, ink, rows, mh)
        log = []
        unread = account_ink(rows, ruby, clean, mh, Ww, figs, log)
        second_pass(rows, clean, mh, Ww, figs, log)
        if os.environ.get('GLYPH', '1') == '1':
            import glyphcheck              # Hybrid cho ảnh scan: kiểm tra + khôi phục bằng vẽ lại chữ
            # so trên ảnh ĐÃ XOÁ đường kẻ / gạch chân (nét gạch chân nối liền các chữ, không tách được ô)
            cink = ink_mask(clean)
            soft = (cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY) < 200).astype(np.uint8)
            glyphcheck.restore_rows(rows, cink, log, soft)
            glyphcheck.size_audit(rows, cink, log)     # ゃ/や, っ/つ ở MỌI dòng, kể cả dòng OCR tự tin
            glyphcheck.dedupe_overlap(rows, log)       # chữ bị đọc hai lần ở chỗ hai hộp chữ chồng nhau
            glyphcheck.respace_rows(rows, cink, log)   # khoảng trắng giữa cụm từ theo ảnh, không theo OCR
        unread += [g for r in rows for g in r.get('unread_gaps', [])]
        for e in log: print('  p%d' % pno, *e)
        # tìm lại chữ đích cho furigana: chữ bên dưới có thể chỉ được đọc bù ở bước sau (薬 bị OCR bỏ sót lượt 1)
        cur_lines = [l for r_ in rows for l in r_['ls']]
        for f in ruby:
            if f.get('target') is None:
                fx0, fy0, fx1, fy1 = f['box']
                below = [l for l in cur_lines if 0 <= l['box'][1] - fy1 <= 0.6 * mh
                         and l['box'][0] < fx1 and l['box'][2] > fx0]
                f['target'] = min(below, key=lambda l: l['box'][1]) if below else None
        attach_ruby(ruby, ink, mh)
        pdata.append(dict(pno=pno, img=img, ink=ink, clean=clean, rows=rows, figs=figs, mh=mh, unread=unread, ruby=ruby))
    if os.environ.get('GLYPH', '1') == '1':
        import voicemark               # dấu ゛/゜: so hình dạng vết dấu, đối chiếu với dấu ゜ chắc chắn trong cả đề
        vlog = []
        voicemark.audit([(d['rows'], cv2.cvtColor(d['img'], cv2.COLOR_BGR2GRAY), ink_mask(d['clean'])) for d in pdata], vlog)
        for e in vlog: print('  ', *e)
    # toàn bộ chữ của đề (để kiểm tra cách viết nhất quán giữa các chỗ)
    global DOC_TEXT
    DOC_TEXT = ''.join(l['text'] for d in pdata for r in d['rows'] for l in r['ls'])
    # Lượt 2: NỐI các trang liền nhau thành một dải dài rồi mới nhận cấu trúc, để câu hỏi /
    # phương án / đoạn văn vắt sang trang sau vẫn ghép đúng.
    groups = []
    for d in pdata:
        if groups and d['pno'] == groups[-1][-1]['pno'] + 1:
            groups[-1].append(d)
        else:
            groups.append([d])
    for gid, grp in enumerate(groups):
        section, prev_id, pending_passage = None, None, []
        sec_tops = []
        offs, off = [], 0
        for d in grp:
            offs.append(off)
            for r in d['rows']:
                r['cy'] += off; r['top'] += off; r['bottom'] += off
                for l in r['ls']:
                    l['box'] = [l['box'][0], l['box'][1] + off, l['box'][2], l['box'][3] + off]
            d['figs'] = [(f[0], f[1] + off, f[2], f[3] + off) for f in d['figs']]
            d['unread'] = [(u[0], u[1] + off, u[2], u[3] + off) for u in d['unread']]
            fp = os.path.join(ocr_dir, f"p{d['pno']:02d}_frames.json")
            d['frames'] = [(f[0], f[1] + off, f[2], f[3] + off) for f in (json.load(open(fp)) if os.path.exists(fp) else [])]
            off += d['img'].shape[0]
        page_of = lambda y: next(d['pno'] for d, o in zip(reversed(grp), reversed(offs)) if y >= o)
        img = np.vstack([d['img'] for d in grp]); ink = np.vstack([d['ink'] for d in grp])
        clean = np.vstack([d['clean'] for d in grp])
        rows = [r for d in grp for r in d['rows']]
        figs = [f for d in grp for f in d['figs']]
        FRAMES[:] = [f for d in grp for f in d['frames']]
        build.FRAMES_B = FRAMES
        # trang Hybrid: vạch ngang vector (đã cộng độ lệch khi nối trang)
        hr_all, any_h = [], False
        for d, o in zip(grp, offs):
            hp = os.path.join(ocr_dir, f"p{d['pno']:02d}_hrules.json")
            if os.path.exists(hp):
                any_h = True
                hr_all += [(a, b, y + o) for a, b, y in json.load(open(hp))]
        build.HRULES = hr_all if any_h else None
        unread = [u for d in grp for u in d['unread']]
        mh = statistics.median(d['mh'] for d in grp)
        Ww = img.shape[1]
        right_edge = max(r['x1'] for r in rows) if rows else Ww
        pno = grp[0]['pno']
        qcol = None
        blocks, cur, sec_open, ex_mode = [], None, False, False
        sec_has_q, sec_page, ex_ranges, sec_rows = False, None, [], []
        DBG = os.environ.get('DEBUG_ROWS')
        for r in rows:
            t = ' '.join(l['text'] for l in r['ls']).translate(FW).strip()
            if DBG:
                print('    ROW', int(r['top']), int(r['x0']), t[:50], '| cur=', cur and cur['id'], cur and cur['opt_labels'])
            bare = sec_open and section is not None and BARE_TITLE.fullmatch(re.sub(r'\[\[|\]\]|\s', '', section))
            if bare and SECTION_RE.match(t) and not BARE_TITLE.fullmatch(re.sub(r'\s', '', t)):
                # tiêu đề mục đứng riêng một dòng ("もんだい１"), dòng sau là lời hướng dẫn nhắc lại tên mục
                section += '\n' + row_text(r, underline_segments(ink, r, mh), mh, ink, clean)
                sec_rows.append(r)
                continue
            if SECTION_RE.match(t):
                if section is not None and not sec_has_q:
                    EMPTY_SECTIONS.append([clean_section(section), sec_page, list(sec_rows), gid])
                sec_has_q, sec_page = False, page_of(r['top'])
                sec_tops.append(r['top'])            # để vùng mực trong tiêu đề mục không bị gán cho câu phía trên
                # tiêu đề trơn ("もんだい２") không có gạch chân: nét đáy chữ số in đậm cỡ to không phải gạch chân
                segs = [] if BARE_TITLE.fullmatch(re.sub(r'\s', '', t)) else underline_segments(ink, r, mh)
                section = row_text(r, segs, mh, ink, clean); sec_open = True
                sec_rows = [r]
                if re.match(r'^(問題|もんだい|Questions?|QUESTIONS?|Part|PART)\s*1(?!\d)', t):
                    prev_id = None      # phần thi mới: đánh số lại từ đầu
                cur = None; pending_passage = []; passage = None
                blocks.append({'type': 'section'}); continue
            instr = re.search(r'1・2・3・4|１・２・３・４|えら[んびべ]|ください。?$|なさい|Choose|choose|correct|Write|answer', t)
            # dòng hướng dẫn nối tiếp: sát ngay dưới, cùng cỡ chữ, VÀ có nội dung hướng dẫn ("1から3の なかから").
            # Câu dẫn của đoạn văn ("日本で べんきょうして いる 学生が...") cũng sát ngay dưới nhưng không phải hướng dẫn.
            contig = (sec_open and sec_rows and NOPT_RE.search(t) and r['top'] - sec_rows[-1]['bottom'] < 0.75 * mh
                      and abs((r['bottom'] - r['top']) - (sec_rows[-1]['bottom'] - sec_rows[-1]['top'])) < 0.35 * mh
                      and not QNUM_RE.match(t) and not BAN_RE.match(t) and not label_kind(t)
                      and not re.match(r'^[（(]?\s*(例|れい|Example|EXAMPLE)\s*[)）]?\s*$', t))
            # "3・4から" (nửa sau của "1・2・3・4から" bị xuống dòng) không phải số câu 3
            label_seq = bool(re.match(r'^\s*\d\s*[・·•\-－]\s*\d', t))
            if sec_open and (instr or contig or not re.search(r'[。.:：]\s*$', section)) and (instr or label_seq or not QNUM_RE.match(t)):
                # tiếng Nhật: GIỮ chỗ xuống dòng như bản gốc (đề in cách quãng cụm từ; nối liền hai dòng sẽ làm
                # mất khoảng trắng mà máy không biết chắc có hay không, vd "それから / はなしを")
                section += (' ' if is_latin(section) else '\n') + row_text(r, underline_segments(ink, r, mh), mh, ink, clean)
                sec_rows.append(r)
                continue
            sec_open = False
            mb = BAN_RE.match(t)
            ban_ok = bool(mb) and (prev_id is None or int(mb.group(1)) in (1, prev_id + 1))
            if re.match(r'^[（(]?\s*(例|れい|問題例|もんだいれい|Example|EXAMPLE)\s*[)）]?', t) or (ex_mode and not ban_ok and not (QNUM_RE.match(t) and boxed_number(r, ink, mh))):
                # phần VÍ DỤ MẪU của đề (không phải câu hỏi): bỏ qua tới câu thật đầu tiên
                if not ex_mode:
                    print('  bỏ qua phần ví dụ mẫu:', t[:30])
                    ex_ranges.append([r['top'], None])      # tranh của phần ví dụ không thuộc câu nào
                ex_mode = True
                if not (QNUM_RE.match(t) and boxed_number(r, ink, mh)):
                    continue
            if ex_mode and ex_ranges and ex_ranges[-1][1] is None:
                ex_ranges[-1][1] = r['top']
            ex_mode = False
            kind = label_kind(t)
            # --- câu của đề nghe: "Nばん"
            if ban_ok:
                n = int(mb.group(1))
                if qcol is None or r['x0'] < qcol:
                    qcol = r['x0']
                cur = {'type': 'q', 'id': n, 'rows': [r], 'opts': [], 'opt_labels': [], 'kind': None, 'listen': True,
                       'section': section, 'passage': None, 'page': page_of(r['top']), 'passage_rows': None,
                       'sec_rows': sec_rows}
                blocks.append(cur); prev_id = n; sec_has_q = True; pending_passage = []
                continue
            # --- phương án?
            if cur is not None and kind:
                labs = LABELS[kind]
                want = labs[len(cur['opt_labels'])] if len(cur['opt_labels']) < len(labs) else None
                first = split_by_labels(t, kind, labs.index(want)) if want else []
                ok_seq = first and first[0][0] == want and (cur['kind'] in (None, kind))
                indent = qcol is not None and r['x0'] > qcol + 0.4 * mh
                if ok_seq and (kind != 'num' or indent or len(first) >= 2 or cur['opt_labels'] or cur.get('listen')):
                    cur['kind'] = kind
                    cur['opts'].append(r)
                    cur['opt_labels'] += [lab for lab, _ in (first[:1] if cur.get('listen') else first)]
                    continue
            # --- câu hỏi mới?
            m = QNUM_RE.match(t)
            if m:
                n = int(m.group(1))
                # số câu thật: có dấu chấm / khoảng trắng sau số, hoặc số đứng riêng một ô OCR (số trong khung)
                has_sep = (bool(re.match(r'^\s*[（(]?\d{1,2}[)）]?(\s*[.．。:]|\s)', t))
                           or r['ls'][0]['text'].strip().isdigit() or boxed_number(r, ink, mh))
                in_col = qcol is None or r['x0'] <= qcol + 1.0 * mh
                restart = n == 1 and has_sep and prev_id is not None and prev_id >= 5
                plausible = in_col and ((prev_id is None and has_sep) or restart or (prev_id is not None and n == prev_id + 1)
                                        or (prev_id is not None and has_sep and prev_id < n <= prev_id + 3))
                waiting_num = (cur is not None and cur['kind'] in (None, 'num') and kind == 'num'
                               and len(cur['opt_labels']) < 4 and str(n) == '1234'[len(cur['opt_labels'])])
                if plausible and not waiting_num:
                    if qcol is None or r['x0'] < qcol:
                        qcol = r['x0']
                    pas = '\n\n'.join(pending_passage) if pending_passage else passage
                    if pending_passage:
                        passage_rows = (gid, pending_rows)
                    cur = {'type': 'q', 'id': n, 'rows': [r], 'opts': [], 'opt_labels': [], 'kind': None,
                           'section': section, 'passage': pas, 'page': page_of(r['top']),
                           'passage_rows': passage_rows if pas else None, 'sec_rows': sec_rows}
                    passage = pas; pending_passage = []
                    blocks.append(cur); prev_id = n; sec_has_q = True
                    rest = t[m.end():].strip()
                    rk = label_kind(rest)
                    if rk and len(split_by_labels(rest, rk)) >= 2:
                        r['opt_strip'] = m.end()      # phần sau số câu là các phương án
                        cur['kind'] = rk
                        cur['opts'].append(r)
                        cur['opt_labels'] += [lab for lab, _ in split_by_labels(rest, rk)]
                        cur['rows'] = []
                        cur['num_row'] = r
                    continue
            # --- phương án dài bị xuống dòng: hàng không có nhãn, thụt vào bằng phần chữ của phương án
            prev_h = cur['opts'][-1]['bottom'] - cur['opts'][-1]['top'] if cur is not None and cur['opts'] else 0
            if (cur is not None and cur['opts'] and not kind and not m
                    and r['x0'] >= cur['opts'][-1]['x0'] + 0.3 * mh
                    and r['top'] - cur['opts'][-1]['bottom'] < 0.9 * mh
                    # dòng nối tiếp phải CÙNG CỠ CHỮ với phương án (furigana / chữ trong hình nhỏ hơn hẳn)
                    and (r['bottom'] - r['top']) >= 0.85 * prev_h
                    and not any(f[0] - 4 <= r['x0'] and r['x1'] <= f[2] + 4 and f[1] - 0.6 * mh <= r['top'] <= f[3]
                                for f in figs)):
                cur['opts'].append(r)
                continue
            # --- đề nghe: câu không in lời hỏi, mọi dòng lạ trong câu đều đáng ngờ
            if cur is not None and cur.get('listen'):
                cur.setdefault('stray', []).append(t[:40])
                continue
            # --- dòng nối của câu hỏi (hội thoại nhiều dòng)
            if cur is not None and not cur['opts']:
                cur['rows'].append(r); continue
            # --- dòng trông như hàng phương án / số câu mà không khớp chỗ nào: KHÔNG coi là đoạn văn
            last_q = next((b for b in reversed(blocks) if b['type'] == 'q'), None)
            looks_opt = kind and len(split_by_labels(t, kind)) >= 2
            looks_q = bool(re.match(r'^\s*\d{1,2}\s*[.．。]', t))
            if (looks_opt or looks_q) and last_q is not None:
                last_q.setdefault('stray', []).append(t[:40])
                cur = None
                continue
            # --- còn lại: đoạn văn cho các câu phía sau
            txt = row_text(r, underline_segments(ink, r, mh), mh, ink, clean)
            txt = apply_ruby_markup(r, txt)
            if not pending_passage:
                pending_rows = []
            pending_rows.append(r)
            prev_full = pending_passage and pending_passage_last_full[0]
            indent = pending_passage and r['x0'] > pending_base[0] + 0.8 * mh
            if pending_passage and prev_full and not indent:
                pending_passage[-1] = join_lines(pending_passage[-1], txt)
            else:
                pending_passage.append(txt)
                pending_base = [r['x0'] if len(pending_passage) == 1 else min(pending_base[0], r['x0'])]
            # dòng "đầy" (chữ chạy tiếp xuống dòng sau) phải chạm mép phải VÀ bắt đầu từ lề trái của đoạn văn;
            # dòng ngắn căn lề phải (tên tác giả "イム　ユリ") chạm mép phải nhưng là một dòng riêng
            pending_passage_last_full = [r['x1'] > right_edge - 1.2 * mh and r['x0'] <= pending_base[0] + 2.0 * mh]
            cur = None

        if section is not None and not sec_has_q:
            EMPTY_SECTIONS.append([clean_section(section), sec_page, list(sec_rows), gid])
        if ex_ranges and ex_ranges[-1][1] is None:
            ex_ranges[-1][1] = img.shape[0]
        # tranh nằm trong phần ví dụ mẫu: bỏ, không gắn cho câu nào
        figs = [f for f in figs if not any(a <= (f[1] + f[3]) / 2 <= b for a, b in ex_ranges)]
        qblocks = [b for b in blocks if b['type'] == 'q']
        # Gắn hình cho câu: hình nằm TRONG khoảng của câu -> câu đó; nằm GIỮA hai câu -> câu gần hơn
        # (cùng mục); nằm trước câu đầu tiên của mục -> câu đầu tiên đó.
        spans = []
        for b in qblocks:
            rr = b['rows'] + b['opts'] + ([b['num_row']] if b.get('num_row') else [])
            spans.append((min(r['top'] for r in rr), max(r['bottom'] for r in rr), b))
        fig_owner = {}
        for f in figs:
            above = [sp for sp in spans if sp[2].get('listen') and sp[0] <= f[1] + 0.5 * mh]
            if above and not any(st > above[-1][0] and st < f[1] for st in sec_tops):
                fig_owner[f] = above[-1][2]; continue      # đề nghe: tranh thuộc câu "Nばん" ngay phía trên
            inside = [sp for sp in spans if sp[0] - 0.5 * mh <= (f[1] + f[3]) / 2 <= sp[1] + 0.5 * mh]
            if inside:
                fig_owner[f] = inside[0][2]; continue
            prev = [sp for sp in spans if sp[1] <= f[1]]
            nxt_ = [sp for sp in spans if sp[0] >= f[3]]
            pb = prev[-1] if prev else None
            nb = nxt_[0] if nxt_ else None
            if pb and nb and pb[2]['section'] == nb[2]['section']:
                fig_owner[f] = pb[2] if f[1] - pb[1] <= nb[0] - f[3] else nb[2]
            elif nb and (not pb or pb[2]['section'] != nb[2]['section']):
                fig_owner[f] = nb[2]
            elif pb:
                fig_owner[f] = pb[2]
        def sec_check(srs):
            # lời hướng dẫn của mục: kiểm như câu hỏi; không chắc -> hiện ảnh cắt đúng phần đó
            sy0, sy1 = int(srs[0]['top'] - 0.3 * mh), int(srs[-1]['bottom'] + 0.3 * mh)
            body = srs
            t0 = re.sub(r'\[\[|\]\]|\s', '', ''.join(l['text'] for l in srs[0]['ls']).translate(FW))
            if len(srs) > 1 and BARE_TITLE.fullmatch(t0):
                # dòng tiêu đề trơn "もんだい２": chỉ có số mục, được kiểm bằng THỨ TỰ các mục (check_section_order),
                # không bằng độ tin cậy OCR của chữ in đậm cỡ to
                body = srs[1:]
            ssc = min(l['score'] for r_ in body for l in r_['ls'])
            stx = ''.join(l['text'] for r_ in body for l in r_['ls'])
            swhy = []
            if ssc < 0.95: swhy.append('độ tin cậy %.2f' % ssc)
            if any(sy0 <= (u[1] + u[3]) / 2 <= sy1 for u in unread): swhy.append('có vùng mực không đọc được')
            if rare_chars(stx): swhy.append('chữ hiếm ' + ''.join(rare_chars(stx)))
            if any(r_.get('u_debug') for r_ in srs): swhy.append('gạch chân không chắc')
            sc_fn = f'section_p{page_of(srs[0]["top"])}_{int(srs[0]["top"])}.png'
            cv2.imwrite(os.path.join(out_dir, sc_fn), img[max(0, sy0):sy1, int(0.07 * Ww):int(0.93 * Ww)])
            return sc_fn, swhy
        for e in EMPTY_SECTIONS:
            if len(e) == 4 and e[3] == gid and e[2]:
                fn_, why_ = sec_check(e[2])
                e[2] = {'section_crop': fn_ if why_ else None, 'section_check': why_, '_sec_fn': fn_}
        clean_ink = ink_mask(clean) > 0
        page_q = []
        for i, b in enumerate(qblocks):
            top = (b['rows'] or [b['num_row']])[0]['top']
            pno = page_of(top)
            nxt = (qblocks[i + 1]['rows'] or [qblocks[i + 1]['num_row']])[0]['top'] if i + 1 < len(qblocks) else None
            b_figs = [f for f in figs if fig_owner.get(f) is b]
            last = max([r['bottom'] for r in b['rows'] + b['opts']] + [f[3] for f in b_figs])
            y0 = int(top - 0.35 * mh); y1 = int(last + 0.35 * mh)
            crop = f'crop_p{pno}_q{b["id"]}.png'
            cv2.imwrite(os.path.join(out_dir, crop), img[y0:y1, int(0.07 * Ww):int(0.93 * Ww)])
            fig_files = []
            for k, f in enumerate(b_figs):
                fn = f'fig_p{pno}_q{b["id"]}_{k}.png'
                cv2.imwrite(os.path.join(out_dir, fn), img[f[1]:f[3], f[0]:f[2]])
                fig_files.append(fn)
            parts = []
            for r in b['rows']:
                s = row_text(r, underline_segments(ink, r, mh), mh, ink, clean)
                parts.append(apply_ruby_markup(r, s))
            # nối dòng: chữ Latin bị ngắt giữa câu ("...on this" / "site?") -> nối bằng dấu cách;
            # tiếng Nhật / lời thoại A「 B「 -> giữ xuống dòng
            stem = ''
            for i_p, p_ in enumerate(parts):
                if i_p and is_latin(stem) and is_latin(p_) and not re.search(r'[.?!:;]["\']?\s*$', stem):
                    stem += ' ' + p_.lstrip()
                else:
                    stem += ('\n' if i_p else '') + p_
            # bỏ số câu ở đầu; dấu "[[" chỉ được bỏ khi nó bọc chính số câu / dấu chấm sau số,
            # không được ăn mất "[[" của chữ gạch chân đứng ngay sau số ("12　[[だんせい]]の")
            stem = re.sub(r'^\s*(?:\[\[[（(]?%d[)）]?\]\]|[（(]?%d[)）]?)\s*(?:\[\[[.．。:]\]\]|[.．。:])?\s*' % (b['id'], b['id']), '', stem)
            if re.fullmatch(r'[\[［(（]?\s*\d{1,2}\s*[\]］)）]?', stem.strip()):
                stem = ''          # câu điền ô trong đoạn văn: chỉ có số ô
            if b.get('listen'):
                stem = ''          # đề nghe: lời hỏi nằm trong băng
            blk_bottom = nxt if nxt is not None else img.shape[0]
            # tiêu đề mục kế tiếp (và lời hướng dẫn của nó) không thuộc câu này
            later = [s for s in sec_tops if s > top]
            if later:
                blk_bottom = min(blk_bottom, min(later) - 0.3 * mh)
            if b.get('listen'):
                # đề nghe: ảnh câu = cả khối từ dòng "Nばん" tới câu sau (tranh, bảng chọn), trong cùng trang,
                # bỏ chân trang; cắt sát vùng có mực
                k_pg = [i_ for i_, d_ in enumerate(grp) if d_['pno'] == pno][0]
                pg_end = offs[k_pg] + 0.925 * grp[k_pg]['img'].shape[0]
                yb = int(min(blk_bottom, pg_end))
                band = ink[int(top):yb, int(0.07 * Ww):int(0.93 * Ww)]
                ys_ = np.flatnonzero(band.any(axis=1))
                if len(ys_):
                    y1c = int(top) + int(ys_.max()) + int(0.35 * mh)
                    y0c = int(top - 0.35 * mh)
                    cv2.imwrite(os.path.join(out_dir, crop), img[y0c:y1c, int(0.07 * Ww):int(0.93 * Ww)])
            b['unread'] = [u for u in unread if top - 0.3 * mh <= (u[1] + u[3]) / 2 < blk_bottom]
            # đoạn văn: kiểm tra như câu hỏi; không chắc -> hiện ảnh cắt đúng đoạn văn
            if b.get('passage_rows'):
                ppage, prow = b['passage_rows']
                if ppage == gid and prow:
                    psc = min(l['score'] for r in prow for l in r['ls'])
                    ptxt = ''.join(l['text'] for r in prow for l in r['ls'])
                    py0, py1 = int(prow[0]['top'] - 0.4 * mh), int(prow[-1]['bottom'] + 0.4 * mh)
                    p_unread = [u for u in unread if py0 <= (u[1] + u[3]) / 2 <= py1]
                    why = []
                    if psc < 0.95: why.append('độ tin cậy %.2f' % psc)
                    if rare_chars(ptxt): why.append('chữ hiếm ' + ''.join(rare_chars(ptxt)))
                    if mixed_script(ptxt): why.append('chữ Latin lẫn trong chữ Nhật: ' + ', '.join(mixed_script(ptxt)))
                    if p_unread: why.append('có vùng mực không đọc được')
                    b['passage_check'] = why
                    # luôn cắt sẵn ảnh đoạn văn: bước kiểm tra từ điển phía sau cũng có thể cần nó
                    pc = f'passage_p{pno}_{int(prow[0]["top"])}.png'
                    cv2.imwrite(os.path.join(out_dir, pc), img[max(0, py0):py1, int(0.07 * Ww):int(0.93 * Ww)])
                    b['passage_crop_new'] = pc
                    if why:
                        b['passage_crop'] = pc
            # phương án: nối các hàng phương án rồi tách theo nhãn đúng thứ tự
            otext = ' '.join((' '.join(l['text'] for l in r['ls']).translate(FW).strip()[r['opt_strip']:]
                              if r.get('opt_strip') else ' '.join(l['text'] for l in r['ls'])) for r in b['opts']).translate(FW)
            opts = split_by_labels(otext, b['kind']) if b['kind'] else []
            if b.get('listen') and b['kind'] == 'num' and b['opts']:
                opts = []
                for k_, r_ in enumerate(b['opts']):
                    rt = ' '.join(l['text'] for l in r_['ls']).translate(FW).strip()
                    lab = '1234'[k_] if k_ < 4 else None
                    mm = re.match(r'^%s(?:[.．)]\s*|[\s　]+|(?=[^\x00-\x7f\d]))' % lab, rt) if lab else None
                    opts.append((lab, rt[mm.end():].strip(' 　') if mm else ''))
            scores = [l['score'] for r in b['rows'] + b['opts'] for l in r['ls']]
            qlines = {id(l) for r in b['rows'] + b['opts'] for l in r['ls']}
            # furigana nằm trên dòng của câu mà không gắn được vào chữ nào -> hiển thị sẽ THIẾU furigana
            ruby_lost = [f['text'] for d_ in grp for f in d_['ruby']
                         if not f.get('attached') and (
                             (f.get('target') is not None and id(f['target']) in qlines)
                             or (f.get('target') is None and any(
                                 0 <= r_['top'] - f['box'][3] <= 0.6 * mh and r_['x0'] < f['box'][2] and r_['x1'] > f['box'][0]
                                 for r_ in b['rows'] + b['opts'])))]
            ruby_pairs = [(l['text'][st:st + n_], rt) for r in b['rows'] + b['opts'] for l in r['ls']
                          for st, n_, rt in l.get('ruby', [])]
            # furigana OCR BỎ SÓT hẳn (không có dòng furigana nào): vết mực nhỏ ngay trên dòng chữ của câu,
            # không thuộc dòng chữ / dòng furigana nào đã đọc
            ruby_boxes = [f['box'] for d_ in grp for f in d_['ruby']]
            all_boxes = [l['box'] for r_ in rows for l in r_['ls']] + ruby_boxes
            for r in b['rows'] + b['opts']:
                if b.get('listen'):
                    break
                y0b, y1b = int(r['top'] - 0.6 * mh), int(r['top'] - 0.04 * mh)
                x0b, x1b = int(r['x0']), int(r['x1'])
                if y0b < 0 or y1b <= y0b:
                    continue
                band = clean_ink[y0b:y1b, x0b:x1b].copy()
                for bx in all_boxes:
                    if bx[3] > y0b and bx[1] < y1b and bx[2] > x0b and bx[0] < x1b:
                        band[max(0, bx[1] - y0b):max(0, bx[3] - y0b), max(0, bx[0] - x0b - 4):max(0, bx[2] - x0b + 4)] = 0
                nb, _, st_, _ = cv2.connectedComponentsWithStats(band.astype(np.uint8), connectivity=8)
                blobs = [st_[k] for k in range(1, nb) if st_[k][4] >= 0.01 * mh * mh and st_[k][3] < 0.5 * mh]
                xs_b = sorted((bb[0], bb[0] + bb[2]) for bb in blobs)
                # cụm chữ nhỏ: >= 2 vết, trải >= 0.5 cỡ chữ (một chấm lẻ là nhiễu / dấu câu dòng trên)
                if len(xs_b) >= 2 and xs_b[-1][1] - xs_b[0][0] >= 0.5 * mh:
                    ruby_lost.append('(vết furigana chưa đọc được trên dòng "%s")' % ''.join(l['text'] for l in r['ls'])[:12])
            q = {'id': b['id'], 'section': clean_section(b['section'] or ''), 'passage': b['passage'],
                 'question': stem, 'options': [o for _, o in opts], 'labels': [lab for lab, _ in opts],
                 'kind': b['kind'], 'images': fig_files, 'crop': crop, 'page': pno, 'reasons': [],
                 'low': min(scores) if scores else 0, 'stray': b.get('stray', []), 'unread': b.get('unread', []),
                 'passage_check': b.get('passage_check', []), 'passage_crop': b.get('passage_crop'),
                 'missing': any(l.get('missing') for r in b['rows'] + b['opts'] for l in r['ls']),
                 'uncertain': [d for r in b['rows'] for d in r.get('u_debug', [])],
                 '_gid': gid, '_pcrop_new': b.get('passage_crop_new'),
                 # chữ nằm trong các dòng đã được so ảnh xác nhận từng chữ
                 'gv': ''.join(l['text'] for r in b['rows'] + b['opts'] for l in r['ls'] if l.get('glyph_verified')),
                 'listen': bool(b.get('listen')), 'ruby_lost': ruby_lost, 'ruby_pairs': ruby_pairs}
            # lời hướng dẫn của mục: kiểm như câu hỏi; không chắc -> hiện ảnh cắt đúng phần đó
            srs = b.get('sec_rows') or []
            if srs and False:
                sy0, sy1 = int(srs[0]['top'] - 0.3 * mh), int(srs[-1]['bottom'] + 0.3 * mh)
                ssc = min(l['score'] for r_ in srs for l in r_['ls'])
                stx = ''.join(l['text'] for r_ in srs for l in r_['ls'])
                swhy = []
                if ssc < 0.95: swhy.append('độ tin cậy %.2f' % ssc)
                if any(sy0 <= (u[1] + u[3]) / 2 <= sy1 for u in unread): swhy.append('có vùng mực không đọc được')
                if rare_chars(stx): swhy.append('chữ hiếm ' + ''.join(rare_chars(stx)))
                if any(r_.get('u_debug') for r_ in srs): swhy.append('gạch chân không chắc')
                if swhy:
                    sc_fn = f'section_p{page_of(srs[0]["top"])}_{int(srs[0]["top"])}.png'
                    cv2.imwrite(os.path.join(out_dir, sc_fn), img[max(0, sy0):sy1, int(0.07 * Ww):int(0.93 * Ww)])
                    q['section_crop'] = sc_fn
                    q['section_check'] = swhy
            if srs:
                sc_fn, swhy = sec_check(srs)
                q['_sec_fn'] = sc_fn
                if swhy:
                    q['section_crop'] = sc_fn; q['section_check'] = swhy
            if b.get('listen'):
                no = n_options(q['section'])
                q['n_opt'] = no
                if not opts:
                    # câu chỉ có tranh / chỉ có tiếng: hiện ảnh gốc (tranh) + nút 1..N
                    q['answer_only'] = True
                    q['labels'] = [str(k + 1) for k in range(no or 0)]
                    q['kind'] = 'num'
                # điểm tin cậy chỉ tính trên phương án (dòng "Nばん" là tiêu đề)
                osc = [l['score'] for r in b['opts'] for l in r['ls']]
                q['low'] = min(osc) if osc else 1.0
            qs.append(q)
            page_q.append((q, b))
        check_voicing(page_q, img, clean)
    # ô điền số trong đoạn văn: "(19) ..........." (lớp chữ) / "(19).of" (OCR bỏ chấm, sót 1 dấu)
    # -> hiển thị thống nhất "(19) ……"
    blank = re.compile(r'([（(]\s*\d{1,2}\s*[)）])[ \t　]*(?:[.．…_]{1,}[ \t　]*)+(?=[A-Za-z\s]|$)')
    for q in qs:
        for k in ('question', 'passage'):
            if q.get(k):
                q[k] = blank.sub(r'\1 …… ', q[k]).replace('……  ', '…… ')
                if k == 'passage':   # ô điền dính liền chữ sau: "(20)to make" -> "(20) …… to make"
                    q[k] = re.sub(r'([（(]\d{1,2}[)）])(?=[A-Za-z])', r'\1 …… ', q[k])
        q['options'] = [blank.sub(r'\1 …… ', o).strip() for o in q['options']]
    check_ruby(qs)
    validate(qs)
    check_section_order(qs)
    return qs


def check_ruby(qs):
    # Furigana chữ rất nhỏ: so với cách đọc trong từ điển (kuromoji). Khác -> nghi OCR đọc nhầm (げつよう -> げっよう).
    import subprocess
    pairs = [pr for q in qs for pr in q.get('ruby_pairs', [])]
    res = []
    if pairs:
        r = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rubycheck.cjs')],
                           input=json.dumps(pairs, ensure_ascii=False), capture_output=True, text=True, encoding='utf-8')
        res = json.loads(r.stdout) if r.returncode == 0 and r.stdout else [None] * len(pairs)
    k = 0
    for q in qs:
        for base, rt in q.get('ruby_pairs', []):
            if res[k] is False:
                q.setdefault('extra', []).append('furigana %s|%s khác cách đọc trong từ điển (nghi OCR đọc nhầm)' % (base, rt))
            k += 1
        if q.get('ruby_lost'):
            q.setdefault('extra', []).append('có furigana không gắn được vào chữ: ' + ', '.join(q['ruby_lost']))


def check_section_order(qs):
    # Số mục phải tăng liền nhau (1, 2, 3 ...; về 1 khi sang phần thi mới). Mục lệch thứ tự -> lời hướng dẫn
    # của mục hiện bằng ảnh (số mục in đậm cỡ to chỉ được tin khi khớp thứ tự).
    items, seen = [], set()
    for q in qs:
        if q['section'] and q['section'] not in seen:
            seen.add(q['section']); items.append((q['page'], q['section'], q.get('_sec_fn'), None))
    for e in EMPTY_SECTIONS:
        if e[0] not in seen:
            seen.add(e[0]); items.append((e[1], e[0], (e[2] or {}).get('_sec_fn') if isinstance(e[2], dict) else None, e))
    items.sort(key=lambda x: x[0])
    prev, prev_page = None, None
    for page, sec, fn, e in items:
        if prev_page is not None and page > prev_page + 1:
            prev = None          # bỏ trang giữa (thử nghiệm / đề thiếu trang): không so thứ tự qua chỗ hở
        prev_page = page
        m = re.match(r'^\s*(?:問題|もんだい)\s*([0-9０-９]{1,2})', sec)
        n = int(m.group(1).translate(str.maketrans('０１２３４５６７８９', '0123456789'))) if m else None
        if n is None:
            continue
        if prev is not None and n not in (prev + 1, 1):
            why = 'số mục không liên tục (%d → %d)' % (prev, n)
            print('  ', why, '-> lời hướng dẫn mục hiện bằng ảnh')
            targets = [q for q in qs if q['section'] == sec]
            for q in targets:
                q['section_check'] = (q.get('section_check') or []) + [why]
                q['section_crop'] = q.get('section_crop') or fn
            if e is not None and isinstance(e[2], dict):
                e[2]['section_check'] = (e[2].get('section_check') or []) + [why]
                e[2]['section_crop'] = e[2].get('section_crop') or fn
        prev = n


def check_voicing(page_q, img, clean):
    """Câu hỏi có cụm hiragana nghi nhầm ゛゜ (theo từ điển) -> đọc lại dòng đó trên ẢNH GỐC
    và ảnh sạch phóng to. Chỉ sửa khi một lần đọc lại ra đúng biến thể; không thì hiện ảnh."""
    """Kiểm tra cả câu hỏi, từng phương án và đoạn văn (dấu ゛゜ hiragana/katakana, kanji trông giống nhau)."""
    if not page_q:
        return
    jobs = []      # (q, b, field, index, text)
    for q, b in page_q:
        jobs.append((q, b, 'question', None, re.sub(r'\[\[|\]\]', '', q['question'])))
        for k, o in enumerate(q['options']):
            jobs.append((q, b, 'option', k, o))
        if b.get('passage_rows') and b['passage_rows'][0] == q.get('_gid') and q['passage']:
            jobs.append((q, b, 'passage', None, q['passage']))
    sus = voicing_suspects([j[4] for j in jobs])
    import glyphcheck
    for j, found in zip(jobs, sus):              # + cách viết không nhất quán trong cả đề (背木 / 青木)
        found += glyphcheck.consistency_suspects(j[4], DOC_TEXT)
    what = {'voice': 'dấu ゛゜', 'kvoice': 'dấu ゛゜ (katakana)', 'kanji': 'chữ kanji trông giống',
            'consist': 'chữ viết khác chỗ khác trong đề', 'size': 'chữ nhỏ/chữ to'}
    for (q, b, field, k, _), found in zip(jobs, sus):
        rows = b['rows'] + b['opts'] + (b['passage_rows'][1] if field == 'passage' else [])
        seen = set()
        for f in found:
            run, alt = f['run'], f['variant']
            # chỉ so ĐOẠN NGẮN quanh chữ bị đổi (cụm dài có thể bị xuống dòng giữa chừng)
            i = next((j for j, (x, y) in enumerate(zip(run, alt)) if x != y), 0)
            run, alt = run[max(0, i - 2):i + 3], alt[max(0, i - 2):i + 3]
            if (run, alt) in seen:
                continue
            seen.add((run, alt))
            line = next((l for r in rows for l in r['ls'] if run in l['text'].replace(' ', '').replace('　', '')), None)
            fixed, keep = False, 0
            if line is not None:
                x0, y0, x1, y1 = line['box']
                for src, scale in ((img, 1.0), (clean, 1.5), (img, 2.0)):
                    crop = src[max(0, y0 - 8):y1 + 8, max(0, x0 - 8):x1 + 8]
                    if scale != 1.0:
                        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                    t, sc = read_crop(crop)
                    t = t.replace(' ', '').replace('　', '')
                    if alt in t and sc >= 0.9:
                        fixed = True
                        break
                    if run in t:
                        keep += 1
                if '_cink' not in check_voicing.__dict__ or check_voicing._cid is not clean:
                    check_voicing._cink = ink_mask(clean); check_voicing._cid = clean
                if not fixed and f['kind'] == 'consist':
                    # đọc lại bằng CÙNG mô hình OCR không phải bằng chứng độc lập: so ảnh riêng chữ khác nhau
                    if glyphcheck.confirm_variant(line, check_voicing._cink, run, alt):
                        fixed = True; sc = 1.0; keep = 0
                        print('  so ảnh ủng hộ cách viết nhất quán:', run, '->', alt)
                if not fixed and keep < 2:
                    # đọc lại không quyết được -> so ảnh từng chữ (vẽ lại chữ, so với ảnh đã xoá gạch chân)
                    tg, stg, notes = glyphcheck.restore_line(line, check_voicing._cink)
                    tg = tg.replace(' ', '').replace('　', '')
                    if alt in tg and notes:
                        fixed = True; sc = max(n[2] for n in notes)
                        print('  so ảnh quyết định:', run, '->', alt, notes)
                    elif run in tg and stg == 'verified':
                        keep = 2
                        print('  so ảnh xác nhận giữ nguyên:', run)
            # cụm có thể vắt qua dấu gạch chân: "こ[[ひやく]]え" -> tìm cho phép [[ ]] chen giữa các chữ
            loose = re.compile(r'(?:\[\[|\]\])*'.join(re.escape(ch) for ch in run))
            if fixed and field == 'question' and len(loose.findall(q['question'])) != 1:
                fixed = False          # không định vị được đúng 1 chỗ -> không tự sửa, báo admin
                keep = 0
            if fixed:
                print('  sửa %s nhờ đọc lại ảnh gốc:' % what[f['kind']], run, '->', alt, round(sc, 3))
                if field == 'question':
                    def _swap(mm):
                        s, out, k = mm.group(0), [], 0
                        for ch in s:            # thay từng chữ, giữ nguyên dấu [[ ]]
                            if ch in '[]':
                                out.append(ch)
                            else:
                                out.append(alt[k]); k += 1
                        return ''.join(out)
                    q['question'] = loose.sub(_swap, q['question'], count=1)
                elif field == 'option':
                    q['options'][k] = q['options'][k].replace(run, alt, 1)
                else:
                    old = q['passage']
                    for qq, _ in page_q:                       # đoạn văn dùng chung cho nhiều câu
                        if qq['passage'] == old:
                            qq['passage'] = old.replace(run, alt)
            elif keep >= 2:
                print('  giữ nguyên (ảnh xác nhận, từ điển chỉ gợi ý):', run, 'không phải', alt)
            else:
                msg = 'nghi đọc nhầm %s ở "%s" (từ điển gợi ý "%s")' % (what[f['kind']], run, alt)
                if field == 'passage':
                    for qq, bb in page_q:
                        if qq['passage'] == q['passage']:
                            qq['passage_check'] = qq.get('passage_check', []) + [msg]
                            qq['passage_crop'] = qq.get('passage_crop') or q.get('_pcrop_new')
                else:
                    q.setdefault('extra', []).append(msg + ('' if field == 'question' else ' – phương án %d' % (k + 1)))


def validate(qs):
    """Kiểm tra theo MỤC: số phương án, ô ★, gạch chân, số câu liên tục, độ tin cậy."""
    by_sec = {}
    for q in qs:
        by_sec.setdefault(q['section'], []).append(q)
    for sec, items in by_sec.items():
        m = re.search(r'\b([A-E])(?:,\s*[A-E])*,?\s*(?:or|và|hoặc)\s*([A-E])\b', sec)
        expected = 'ABCDE'.index(m.group(2)) + 1 if m else statistics.mode(len(q['options']) for q in items)
        if n_options(sec):
            expected = n_options(sec)
        if expected < 3:
            expected = 4      # một câu trắc nghiệm luôn có ít nhất 3 phương án
        star_idx = [i for i, q in enumerate(items) if '〔★〕' in q['question']]
        star_all = '★' in sec
        need_u = ('〔_〕' in sec or '＿' in sec or '_' in sec or 'underlined' in sec.lower()) and not star_all and not star_idx
        prev, prev_page = None, None
        for q in items:
            if prev_page is not None and q['page'] > prev_page + 1:
                prev = None   # thử nghiệm bỏ trang giữa
            prev_page = q['page']
            R = q['reasons']
            if q.get('listen') and not q.get('n_opt'):
                R.append('không đọc được số phương án trong lời hướng dẫn của mục')
            if q.get('answer_only'):
                # tranh / tiếng: hiện đúng ảnh gốc, chỉ cần số câu và số nút đúng
                if prev is not None and q['id'] != prev + 1:
                    R.append('số câu không liên tục (%s → %s)' % (prev, q['id']))
                prev = q['id']
                if q.get('stray'):
                    R.append('có dòng không khớp cấu trúc trong câu: ' + ' / '.join(q['stray']))
                q['mode'] = 'picture' if not R else 'image'
                q['abcd'] = False
                continue
            if len(q['options']) != expected or any(not o for o in q['options']):
                R.append('đọc được %d/%d phương án' % (len([o for o in q['options'] if o]), expected))
            if q['low'] < 0.95:
                R.append('chữ có độ tin cậy thấp (%.2f) sau 3 lần đọc' % q['low'])
            if prev is not None and q['id'] != prev + 1:
                R.append('số câu không liên tục (%s → %s)' % (prev, q['id']))
            prev = q['id']
            i_q = items.index(q)
            star = star_all or (star_idx and star_idx[0] <= i_q <= star_idx[-1])
            if star:
                core = re.sub(r'\[\[|\]\]', '', q['question'])
                m_sl = re.search(r'〔[_★]〕.*〔[_★]〕', core)
                if m_sl and re.sub(r'〔[_★]〕|[\s　]', '', m_sl.group(0)):
                    R.append('có chữ xen giữa các ô trống ★ (thứ tự chữ không chắc)')
                n = q['question'].count('〔_〕') + q['question'].count('〔★〕')
                if n != 4 or q['question'].count('〔★〕') != 1:
                    R.append('xác định được %d/4 ô trống ★' % n)
            if need_u and '[[' not in q['question']:
                R.append('không tìm thấy chữ gạch chân')
            if len(set(q['options'])) < len(q['options']):
                R.append('có hai phương án giống hệt nhau (nghi OCR đọc nhầm)')
            dup = re.findall(r'([㐀-鿿])\1', q['question'] + ''.join(q['options']))
            if dup:
                R.append('kanji lặp liền nhau (nghi OCR đọc lặp): ' + ''.join(d * 2 for d in dup))
            if q.get('stray'):
                R.append('có dòng không khớp cấu trúc ngay sau câu này: ' + ' / '.join(q['stray']))
            # chữ hiếm mà đã được so ảnh xác nhận (thắng các kanji trông giống nó) thì là chữ thật của đề
            rare = [c for c in rare_chars(q['question'] + ''.join(q['options'])) if c not in q.get('gv', '')]
            if rare:
                R.append('có chữ hiếm, có thể đọc nhầm: ' + ''.join(rare))
            if q.get('unread'):
                R.append('có vùng chữ OCR bỏ sót mà đọc lại không được')
            if q.get('missing'):
                R.append('OCR làm rơi chữ, đọc lại vẫn thiếu')
            # dấu ngoặc không cân trong câu / phương án = OCR làm rơi dấu ngoặc (font giãn chữ)
            for _t in [q['question']] + list(q['options']):
                if _t.count('（') + _t.count('(') != _t.count('）') + _t.count(')') or _t.count('「') != _t.count('」') and not ('「' in q['question'] and '」' in ' '.join(q['options'])):
                    R.append('dấu ngoặc không cân (nghi OCR làm rơi dấu ngoặc): ' + _t[:30])
                    break
            mx = mixed_script(q['question'] + ' ' + ' '.join(q['options']))
            if mx:
                R.append('chữ Latin lẫn trong chữ Nhật (nghi đọc nhầm): ' + ', '.join(mx))
            if q.get('passage_check'):
                q['passage_mode'] = 'image'
            for e in q.get('extra', []):
                R.append(e)
            if q['uncertain']:
                # gạch chân không xác nhận được. Chỉ bỏ qua khi nó KHÔNG chứa chữ thật (ô trống, ★,
                # cạnh dưới khung số câu "10"); gạch chân có chữ thật mà bỏ đi = hiện sai so với bản gốc
                def _real(x):
                    x = re.sub(r'[\s　★\-－—_〔〕。、.]', '', str(x or ''))
                    return bool(x) and not re.fullmatch(r'[0-9０-９]{1,3}', x)
                real_u = [d for d in q['uncertain'] if _real(d[0]) or _real(d[2])]
                if real_u:
                    print('  gạch chân có chữ nhưng không xác nhận được -> hiện ảnh: câu', q['id'], real_u)
                if need_u or real_u:
                    R.append('không xác định chắc chắn chữ được gạch chân')
                else:
                    # mục không hỏi về chữ gạch chân: bỏ đánh dấu không chắc, không bắt hiện ảnh
                    print('  bỏ gạch chân không chắc (mục không cần gạch chân): câu', q['id'], q['uncertain'])
            q['mode'] = 'image' if R else 'text'
            q['abcd'] = q['kind'] == 'abc'


if __name__ == '__main__':
    ocr_dir, pages, out_dir = sys.argv[1], [int(x) for x in sys.argv[2].split(',')], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    qs = build(pages, ocr_dir, out_dir)
    json.dump(qs, open(os.path.join(out_dir, 'questions.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    for q in qs:
        print(q['page'], q['id'], q['mode'], q['reasons'], '|', q['question'][:80].replace('\n', '⏎'), '|', q['options'], q['images'],
              '| P:', (q['passage'] or '')[:60].replace('\n', '⏎'))
