import { assetUrl } from '../lib/asset';
import { renderMarked } from '../lib/renderMarked';

/**
 * Các khối dùng chung cho câu trắc nghiệm ở trang làm bài và màn duyệt đề.
 * Đề PDF quét: chỗ máy đọc không chắc chắn được lưu dưới dạng ẢNH GỐC cắt từ đề
 * (`sectionImage`, `passageImage`, `image`) để không bao giờ hiện chữ sai.
 */

/** Tiêu đề mục (問題1 + lời hướng dẫn). Có ảnh gốc thì hiện ảnh thay cho chữ. */
export function SectionHeading({ question, first }) {
  if (question.sectionImage) {
    return (
      <img
        src={assetUrl(question.sectionImage)}
        alt={question.section ? `Lời hướng dẫn: ${question.section.split('\n')[0]}` : 'Lời hướng dẫn của mục'}
        loading="lazy"
        className={`block h-auto w-full max-w-3xl rounded-xl border border-border bg-white ${first ? '' : 'mt-4'}`}
      />
    );
  }
  return (
    <h3 className={`whitespace-pre-line text-sm font-bold leading-7 text-primary ${first ? '' : 'pt-4'}`}>
      {renderMarked(question.section)}
    </h3>
  );
}

/** Đoạn văn chung của nhóm câu. */
export function PassageBlock({ question }) {
  if (question.passageImage) {
    return (
      <img
        src={assetUrl(question.passageImage)}
        alt="Đoạn văn"
        loading="lazy"
        className="block h-auto w-full rounded-2xl border border-border bg-white"
      />
    );
  }
  return (
    <div className="whitespace-pre-line rounded-2xl border border-border bg-secondary/40 p-4 text-sm leading-8 text-foreground/85">
      {renderMarked(question.passage)}
    </div>
  );
}

/** Ảnh của câu: ảnh gốc của cả câu (đề quét) hoặc hình minh hoạ. */
export function QuestionImages({ question, number }) {
  const list = [question.image, ...(Array.isArray(question.images) ? question.images : [])].filter(Boolean);
  if (!list.length) return null;
  const whole = question.display && question.display !== 'text';
  return (
    <div className="mb-4 space-y-2">
      {list.map((src, k) => (
        <img
          key={src + k}
          src={assetUrl(src)}
          alt={whole ? `Câu ${number} (ảnh gốc của đề)` : `Hình minh hoạ câu ${number}`}
          loading="lazy"
          className={whole
            ? 'block h-auto w-full rounded-xl border border-border bg-white'
            : 'mx-auto block h-auto max-h-80 w-auto max-w-full rounded-xl border border-border bg-white object-contain'}
        />
      ))}
    </div>
  );
}

/** Phương án chỉ là nút số (câu hiện bằng ảnh / tranh / chỉ nghe): không lặp lại chữ trong nút. */
export const isLabelOnly = (options) => options.length > 0 && options.every((o) => o.value === o.label);
