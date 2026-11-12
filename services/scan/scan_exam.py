"""Quét MỘT đề PDF (đề scan hoặc PDF chỉ có ảnh) thành câu hỏi + ảnh cắt, gắn đáp án nếu có bảng đáp án.
Server Node gọi file này (services/scanExamService.js); chạy tay để thử:

  python scan_exam.py --pdf de.pdf --out <thư_mục> [--lang japan|en] [--pages 3-16]
                      [--key dapan.pdf] [--key-pages 1-2] [--skill reading|listening]
                      [--reuse-ocr <thư_mục_ocr_có_sẵn>]

- --pages      trang đề cần quét (mặc định: mọi trang). Bỏ bìa / trang trắng để không sinh câu rác.
- --key        file đáp án riêng. Không có --key mà có --key-pages: bảng đáp án nằm trong chính file đề.
- Bảng đáp án có lớp chữ thì đọc thẳng lớp chữ; không có thì OCR trang đó.
- --reuse-ocr  bỏ qua bước OCR, dùng kết quả OCR có sẵn (pNN.json / pNN.png) — để chạy lại / kiểm thử.

Kết quả: <out>/result.json  {questions, part, answer_log, pages}  và ảnh cắt *.png trong <out>.
Đáp án CHỈ gắn khi bảng đáp án đạt bất biến (số câu liền nhau, không trùng) và khớp đúng số câu
dựng được từ đề; không khớp thì để trống và ghi lý do, admin chọn tay.
Dòng "PROGRESS a/b <việc>" trên stdout để server báo tiến độ.
"""
import sys, os, re, json, argparse, collections
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ZEN = str.maketrans('０１２３４５６７８９', '0123456789')


def page_list(spec, n):
    if not spec:
        return list(range(1, n + 1))
    out = []
    for part in re.split(r'[,\s]+', spec.strip()):
        if not part:
            continue
        m = re.fullmatch(r'(\d+)\s*-\s*(\d+)', part)
        a, b = (int(m.group(1)), int(m.group(2))) if m else (int(part), int(part))
        out += [p for p in range(a, b + 1) if 1 <= p <= n and p not in out]
    if not out:
        raise SystemExit('Không có trang hợp lệ trong "%s" (file có %d trang)' % (spec, n))
    return out


_OCR = {}


def ocr_engine(lang):
    if lang not in _OCR:
        from paddleocr import PaddleOCR
        import ocr_models          # ONNX Runtime nếu có (nhanh ~11 lần), không thì engine Paddle gốc
        _OCR[lang] = PaddleOCR(**ocr_models.pipeline_kwargs(lang))
    return _OCR[lang]


def ocr_page(doc, p, out_dir, lang):
    """Lượt OCR 1 trên ẢNH ĐÃ LÀM SẠCH của trang p (như bản scan): pNN.png ảnh gốc, pNN_clean.png
    ảnh đưa vào OCR (bỏ chữ nền mờ, đường kẻ dài, viền khung số câu), pNN.json dòng chữ + toạ độ."""
    import cv2, numpy as np
    from frames import ink_mask, glyph_height, line_mask, find_frames, erase_frames
    img = os.path.join(out_dir, f'p{p:02d}.png')
    doc[p - 1].get_pixmap(dpi=int(2800 / doc[p - 1].rect.width * 72)).save(img)
    im = cv2.imread(img)
    ink = ink_mask(im) > 0
    keep = cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    clean = np.full_like(im, 255)
    clean[keep] = im[keep]
    m = ink.astype(np.uint8)
    rm = cv2.dilate(line_mask(m, glyph_height(m)).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    clean[rm] = 255
    fr = find_frames(ink)
    erase_frames(clean, fr)
    json.dump(fr, open(os.path.join(out_dir, f'p{p:02d}_frames.json'), 'w'))
    cimg = os.path.join(out_dir, f'p{p:02d}_clean.png')
    cv2.imwrite(cimg, clean)
    r = ocr_engine(lang).predict(cimg)[0]
    lines = [{'text': t, 'score': round(float(s), 3), 'box': [int(v) for v in b]}
             for t, s, b in zip(r['rec_texts'], r['rec_scores'], r['rec_boxes'])]
    json.dump(lines, open(os.path.join(out_dir, f'p{p:02d}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    return lines


def _ocr_worker(job):
    """Chạy trong tiến trình con: mỗi tiến trình nạp model một lần, OCR các trang được giao."""
    pdf, p, out_dir, lang = job
    import pymupdf
    ocr_page(pymupdf.open(pdf), p, out_dir, lang)
    return p


def ocr_pages(pdf, doc, pages, out_dir, lang, total):
    """OCR nhiều trang SONG SONG (mặc định 3 tiến trình). Đo N5L 14 trang + đáp án trên Ryzen 7 8845H:
      engine Paddle: 1 tiến trình ~65 giây/trang, 3 tiến trình ~31 giây/trang (cả đề 511 giây);
      ONNX Runtime (ocr_models.py): cả đề 123 giây (1 tiến trình) / 109 giây (3 tiến trình).
    Mọi cấu hình cho ra câu hỏi giống hệt nhau. (Không dùng MKLDNN: lỗi oneDNN của Paddle 3.x; không giảm
    độ phân giải ảnh dò chữ: làm sót dòng chữ.) Số tiến trình: biến môi trường SCAN_WORKERS."""
    todo = [p for p in pages if not os.path.exists(os.path.join(out_dir, f'p{p:02d}.json'))]
    workers = int(os.environ.get('SCAN_WORKERS') or max(1, min(3, (os.cpu_count() or 2) // 4)))
    workers = max(1, min(workers, len(todo)))
    done = len(pages) - len(todo)
    if workers == 1:
        for p in todo:
            print('PROGRESS %d/%d OCR trang %d' % (done, total, p), flush=True)
            ocr_page(doc, p, out_dir, lang)
            done += 1
        return
    import multiprocessing as mp
    print('PROGRESS %d/%d OCR %d trang, %d trang cùng lúc' % (done, total, len(todo), workers), flush=True)
    with mp.get_context('spawn').Pool(workers) as pool:
        for p in pool.imap_unordered(_ocr_worker, [(pdf, p, out_dir, lang) for p in todo]):
            done += 1
            print('PROGRESS %d/%d OCR %d trang, %d trang cùng lúc (vừa xong trang %d)' % (done, total, len(todo), workers, p), flush=True)


def sec_no(section):
    m = re.search(r'(?:問題|もんだい)\s*([0-9０-９]{1,2})', section or '')
    return int(m.group(1).translate(ZEN)) if m else None


def exam_part(ocr_dir, pages):
    """Phần thi của đề, đọc từ chữ in trên trang ('聴解' ở đầu trang / tab mép trang)."""
    import scan_answers
    cnt = collections.Counter()
    for p in pages:
        for l in json.load(open(os.path.join(ocr_dir, f'p{p:02d}.json'), encoding='utf8')):
            m = scan_answers.PART_RE.search(l['text'])
            if m:
                cnt[re.sub(r'\s', '', m.group(0))] += 1
    return cnt.most_common(1)[0][0] if cnt else None


def key_tables(key_pdf, key_pages, key_ocr_dir, lang, log):
    """Bảng đáp án: nối các trang thành một dải (lớp chữ nếu có, không thì OCR)."""
    import pymupdf, scan_answers
    doc = pymupdf.open(key_pdf) if os.path.exists(key_pdf) else None
    lines = []
    for k, p in enumerate(key_pages):
        ls = scan_answers.lines_from_pdf(key_pdf, p) if doc is not None else []
        if len(ls) < 5:
            jp = os.path.join(key_ocr_dir, f'p{p:02d}.json')
            if os.path.exists(jp):
                ls = json.load(open(jp, encoding='utf8'))
            else:
                os.makedirs(key_ocr_dir, exist_ok=True)
                ls = ocr_page(doc, p, key_ocr_dir, lang)
            log.append('trang đáp án %d: không có lớp chữ, đọc bằng OCR' % p)
        for l in ls:
            l['box'] = [l['box'][0], l['box'][1] + k * 100000, l['box'][2], l['box'][3] + k * 100000]
            lines.append(l)
    return scan_answers.parse_lines(lines, verbose=True) if lines else []


# tiêu đề bảng đáp án: 正答表 (lớp chữ chen furigana: "正 せい 答 とう 表"), 解答, "Đáp án", "Answer key"
KEY_TITLE = re.compile(r'正\s*(?:[ぁ-ゖ]+\s*)?答|解\s*(?:[ぁ-ゖ]+\s*)?答|dap\s*an|answer\s*key', re.I)


def page_lines(doc, pdf, p, ocr_dir, lang, may_ocr):
    """Dòng chữ của trang p: lớp chữ PDF nếu có, không thì OCR (dùng lại kết quả OCR nếu đã có)."""
    import scan_answers
    ls = scan_answers.lines_from_pdf(pdf, p) if doc is not None else []
    if len(ls) >= 5:
        return ls, 'lớp chữ'
    jp = os.path.join(ocr_dir, f'p{p:02d}.json')
    if os.path.exists(jp):
        return json.load(open(jp, encoding='utf8')), 'OCR'
    if may_ocr and doc is not None:
        return ocr_page(doc, p, ocr_dir, lang), 'OCR'
    return [], None


def find_key_pages(doc, pdf, n_pages, pages, ocr_dir, lang, may_ocr, log):
    """Bảng đáp án in ở CUỐI file đề: xét 3 trang ngay sau trang đề cuối, 3 trang cuối file và 2 trang cuối
    của dải đề.
    Trang được nhận là trang đáp án khi có tiêu đề bảng đáp án VÀ đọc ra bảng hợp lệ (>= 5 câu, số câu
    liền nhau) — một tiêu đề hay một dãy số đứng riêng không đủ."""
    import scan_answers
    rest = [p for p in range(max(pages) + 1, n_pages + 1)]
    cands = sorted(set(rest[:3] + rest[-3:] + pages[-2:]))
    found = []
    for p in cands:
        ls, src = page_lines(doc, pdf, p, ocr_dir, lang, may_ocr)
        if len(ls) < 5:
            continue
        txt = scan_answers._plain(' '.join(l['text'] for l in ls))
        if not KEY_TITLE.search(txt):
            continue
        tables = scan_answers.parse_lines([dict(l) for l in ls])
        if any(t['ok'] and len(t['keys']) >= 5 for t in tables):
            found.append(p)
            log.append('tìm thấy bảng đáp án ở trang %d của file đề (%s)' % (p, src))
    return found


def set_answer(q, a):
    q['answer'] = a
    q['answer_index'] = q['labels'].index(a) if a is not None and a in (q.get('labels') or []) else None
    if a is not None and q['answer_index'] is None:
        q['answer_note'] = 'đáp án "%s" không khớp nhãn phương án %s' % (a, q.get('labels'))


def no_answer(q, why):
    q['answer'] = None; q['answer_index'] = None; q['answer_note'] = 'Chưa có đáp án: ' + why


def attach_by_section(qs, tables, part, log, listening):
    """Bảng theo từng mục (問題1, 問題2 … mỗi mục đánh số lại từ 1), lọc theo phần thi."""
    import scan_parse
    pool = [t for t in tables if sec_no(t['title'])]
    if part and any(t.get('part') for t in pool):
        pool = [t for t in pool if t.get('part') == part]
    keyed = {}
    for t in pool:
        keyed.setdefault(sec_no(t['title']), t)
    if listening:
        # mục không in câu nào (đề nghe "えなどが ありません"): số câu lấy từ bảng của đúng mục đó
        for sec, page, chk, _g in scan_parse.EMPTY_SECTIONS:
            sn = sec_no(sec)
            chk = chk if isinstance(chk, dict) else {}
            t = keyed.get(sn)
            no = scan_parse.n_options(sec)
            if t is None or not t['ok']:
                log.append('mục %s không in câu nào và không có bảng đáp án dùng được: admin cần nhập số câu' % sn)
                continue
            for i in sorted(t['keys']):
                qs.append({'id': i, 'section': sec, 'passage': None, 'question': '', 'options': [],
                           'labels': [str(k + 1) for k in range(no or 0)], 'kind': 'num', 'page': page,
                           'mode': 'audio' if no else 'image', 'listen': True, 'answer_only': True,
                           'reasons': [] if no else ['không đọc được số phương án trong lời hướng dẫn của mục'],
                           'images': [], 'crop': None, 'section_crop': chk.get('section_crop'),
                           'section_check': chk.get('section_check')})
            log.append('mục %s không in câu nào: tạo %d câu chỉ nghe theo bảng đáp án' % (sn, len(t['keys'])))
    by_sec = collections.OrderedDict()
    for q in qs:
        by_sec.setdefault(sec_no(q['section']), []).append(q)
    for sn, items in by_sec.items():
        t = keyed.get(sn)
        ids = sorted(q['id'] for q in items if q['id'] is not None)
        if t is None:
            why = 'không có bảng đáp án cho mục %s' % sn
        elif not t['ok']:
            why = '; '.join(t['problems'])
        elif sorted(t['keys']) != ids:
            why = 'bảng có câu %s, đề có câu %s' % (sorted(t['keys']), ids)
        else:
            why = None
        for q in items:
            no_answer(q, why) if why else set_answer(q, t['keys'].get(q['id']))
        log.append('mục %s: %s' % (sn, ('KHÔNG gắn đáp án: ' + why) if why else 'gắn đáp án từ bảng "%s"' % t['title']))


def attach_by_part(qs, tables, log):
    """Bảng theo PHẦN thi (số câu chạy liên tục trong cả phần, sang phần sau đánh lại từ 1)."""
    part, prev = 0, None
    for q in qs:
        if prev is not None and q['id'] < prev - 3:
            part += 1
        prev = q['id']
        q['_part'] = part
    for p in sorted(set(q['_part'] for q in qs)):
        items = [q for q in qs if q['_part'] == p]
        t = tables[p] if p < len(tables) else None
        if t is None or not t['ok']:
            why = 'không có bảng đáp án' if t is None else '; '.join(t['problems'])
            for q in items:
                no_answer(q, why)
            log.append('phần %d: KHÔNG gắn đáp án (%s)' % (p + 1, why))
            continue
        miss = [q['id'] for q in items if q['id'] not in t['keys']]
        if miss:
            for q in items:
                no_answer(q, 'bảng "%s" không có câu %s' % (t['title'][:30], miss))
            log.append('phần %d: KHÔNG gắn đáp án (bảng thiếu câu %s)' % (p + 1, miss))
            continue
        for q in items:
            set_answer(q, t['keys'][q['id']])
            if q['id'] in t['low']:
                q['answer_note'] = 'đáp án đọc với độ tin cậy thấp, cần xác nhận'
        log.append('phần %d: gắn đáp án từ bảng "%s"' % (p + 1, t['title'][:30]))


def section_fits(qs, tables, part):
    """Bảng theo mục dùng được khi MỌI mục của đề có bảng cùng số mục."""
    pool = [t for t in tables if sec_no(t['title'])]
    if part and any(t.get('part') for t in pool):
        pool = [t for t in pool if t.get('part') == part]
    have = {sec_no(t['title']) for t in pool}
    secs = {sec_no(q['section']) for q in qs}
    return bool(pool) and None not in secs and secs <= have


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--lang', default='japan')
    ap.add_argument('--pages', default='')
    ap.add_argument('--key', default='')
    ap.add_argument('--key-pages', default='')
    ap.add_argument('--skill', default='reading')
    ap.add_argument('--reuse-ocr', default='')
    a = ap.parse_args()

    import pymupdf
    os.makedirs(a.out, exist_ok=True)
    if a.pdf:
        doc = pymupdf.open(a.pdf)
        n_pages = len(doc)
    elif a.reuse_ocr:       # kiểm thử lại trên OCR có sẵn, không cần file gốc
        doc = None
        n_pages = max(int(m.group(1)) for f in os.listdir(a.reuse_ocr) for m in [re.fullmatch(r'p(\d+)\.json', f)] if m)
    else:
        raise SystemExit('Cần --pdf (hoặc --reuse-ocr để chạy lại trên OCR có sẵn)')
    pages = page_list(a.pages, n_pages)
    ocr_dir = a.reuse_ocr or os.path.join(a.out, 'ocr')
    os.makedirs(ocr_dir, exist_ok=True)
    log = []
    # Đáp án lấy theo thứ tự: (1) file đáp án riêng admin tải lên, (2) trang admin chỉ ra trong file đề,
    # (3) TỰ TÌM bảng đáp án ở cuối file đề — trang đáp án tìm thấy không bị coi là trang đề.
    auto_key = []
    if not a.key and not a.key_pages:
        print('PROGRESS 0/%d tìm bảng đáp án ở cuối file đề' % (len(pages) + 2), flush=True)
        auto_key = find_key_pages(doc, a.pdf, n_pages, pages, ocr_dir, a.lang, not a.reuse_ocr, log)
        pages = [p for p in pages if p not in auto_key]
        if not pages:
            raise SystemExit('Mọi trang đã chọn đều là bảng đáp án; hãy chọn lại trang đề')
    total = len(pages) + 2
    if not a.reuse_ocr:
        ocr_pages(a.pdf, doc, pages, ocr_dir, a.lang, total)
    print('PROGRESS %d/%d dựng câu hỏi' % (len(pages), total), flush=True)
    import scan_parse
    qs = scan_parse.build(pages, ocr_dir, a.out)
    listening = a.skill == 'listening'

    print('PROGRESS %d/%d đọc bảng đáp án' % (len(pages) + 1, total), flush=True)
    key_pdf = a.key or (a.pdf if (a.key_pages or auto_key) else '')
    part = exam_part(ocr_dir, pages)
    if key_pdf or (a.reuse_ocr and (a.key_pages or auto_key)):
        if auto_key:
            kpages = auto_key
        else:
            kpages = page_list(a.key_pages, len(pymupdf.open(key_pdf)) if key_pdf else n_pages)
        key_ocr = ocr_dir if not a.key else os.path.join(a.out, 'key_ocr')
        tables = key_tables(key_pdf, kpages, key_ocr, a.lang, log)
        if not tables:
            log.append('không tìm thấy bảng đáp án trong file đáp án')
            for q in qs:
                no_answer(q, 'không tìm thấy bảng đáp án')
        elif listening or section_fits(qs, tables, part):
            attach_by_section(qs, tables, part, log, listening)
        else:
            attach_by_part(qs, tables, log)
    else:
        log.append('không tìm thấy bảng đáp án ở cuối file đề và không có file đáp án riêng: '
                   'gắn file đáp án ở bước duyệt (không phải quét lại đề), hoặc chọn đáp án cho từng câu')
        for q in qs:
            no_answer(q, 'không có bảng đáp án')
        if listening and scan_parse.EMPTY_SECTIONS:
            log.append('có %d mục không in câu nào: nhập số câu của mục ở bước duyệt' % len(scan_parse.EMPTY_SECTIONS))
    # mục nghe không in câu nào mà chưa tạo được câu (thiếu bảng đáp án): để admin nhập số câu khi duyệt
    have = {q['section'] for q in qs}
    empty = []
    if listening:
        for sec, page, chk, _g in scan_parse.EMPTY_SECTIONS:
            if sec in have:
                continue
            chk = chk if isinstance(chk, dict) else {}
            empty.append({'section': sec, 'page': page, 'n_opt': scan_parse.n_options(sec),
                          'section_crop': chk.get('section_crop'), 'section_check': chk.get('section_check') or []})
    for e in log:
        print(' ', e)
    json.dump({'questions': qs, 'empty_sections': empty, 'part': part, 'answer_log': log, 'pages': pages},
              open(os.path.join(a.out, 'result.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('PROGRESS %d/%d xong' % (total, total), flush=True)


if __name__ == '__main__':
    main()
