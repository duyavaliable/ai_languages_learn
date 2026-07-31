import { useEffect } from "react"
import { AlertTriangle, X } from "lucide-react"

/*
  Custom confirmation modal replacing window.confirm.
  Keeps the same guard flow: an action only proceeds when the user confirms.
*/
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClasses =
    tone === "danger"
      ? "bg-admin-danger text-admin-danger-foreground hover:brightness-95"
      : "bg-admin-primary text-admin-primary-foreground hover:brightness-95"

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-admin-lg border border-admin-border bg-admin-card p-6 shadow-admin-pop"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-md p-1 text-admin-muted-foreground transition-colors hover:bg-admin-muted hover:text-admin-card-foreground"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-admin-danger-soft text-admin-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="pt-0.5">
            <h2 id="confirm-title" className="text-base font-bold text-admin-card-foreground text-balance">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-sm leading-relaxed text-admin-muted-foreground text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-admin-sm border border-admin-border bg-admin-card px-4 py-2 text-sm font-semibold text-admin-card-foreground transition-colors hover:bg-admin-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-admin-sm px-4 py-2 text-sm font-semibold transition ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
