"""Chọn bộ chạy model OCR cho bộ quét.

Mặc định dùng ONNX Runtime nếu có bản ONNX của model: cùng model PP-OCRv6_medium (det + rec) nhưng chạy
nhanh hơn ~11 lần trên CPU (đo trên Ryzen 7 8845H: 65 giây -> 5,8 giây một trang N5L, chữ đọc ra giống hệt,
toạ độ lệch tối đa 1 điểm ảnh). Không có bản ONNX / thiếu onnxruntime thì tự quay về engine Paddle gốc.

Bản ONNX tạo một lần bằng paddle2onnx (xem services/scan/README.md), đặt ở:
    %USERPROFILE%\\.paddlex\\onnx_models\\<tên model>\\inference.onnx (+ inference.yml)
hoặc thư mục trong biến môi trường SCAN_ONNX_DIR. Ép dùng engine Paddle: SCAN_ENGINE=paddle.
Tiếng Nhật và tiếng Anh dùng CHUNG hai model này (PaddleOCR 3.7 chọn PP-OCRv6_medium cho cả 'japan' và 'en').
"""
import os
import importlib.util

DET = 'PP-OCRv6_medium_det'
REC = 'PP-OCRv6_medium_rec'
ONNX_DIR = os.environ.get('SCAN_ONNX_DIR') or os.path.join(os.path.expanduser('~'), '.paddlex', 'onnx_models')


def _onnx_dir(name):
    d = os.path.join(ONNX_DIR, name)
    ok = os.path.exists(os.path.join(d, 'inference.onnx')) and os.path.exists(os.path.join(d, 'inference.yml'))
    return d if ok else None


def use_onnx():
    if os.environ.get('SCAN_ENGINE', 'auto').lower() == 'paddle':
        return False
    return bool(_onnx_dir(DET) and _onnx_dir(REC) and importlib.util.find_spec('onnxruntime'))


def pipeline_kwargs(lang):
    """Tham số cho PaddleOCR(...) (dò chữ + đọc chữ)."""
    kw = dict(lang=lang, use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    if use_onnx() and lang in ('japan', 'en'):
        kw.update(engine='onnxruntime',
                  text_detection_model_name=DET, text_detection_model_dir=_onnx_dir(DET),
                  text_recognition_model_name=REC, text_recognition_model_dir=_onnx_dir(REC))
    else:
        kw.update(enable_mkldnn=False)   # MKLDNN của Paddle 3.x lỗi oneDNN trên máy này
    return kw


def rec_kwargs():
    """Tham số cho TextRecognition(...) (đọc lại một vùng chữ ở bước dựng câu hỏi)."""
    if use_onnx():
        return dict(model_name=REC, model_dir=_onnx_dir(REC), engine='onnxruntime')
    return dict(model_name=REC, enable_mkldnn=False)


def engine_name():
    return 'onnxruntime' if use_onnx() else 'paddle'
