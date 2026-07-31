import { useEffect } from "react"
import { X } from "lucide-react"

export default function Modal({ open, title, description, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-lg rounded-admin-lg border border-admin-border bg-admin-card shadow-admin-pop"
      >
        <div className="flex items-start justify-between gap-4 border-b border-admin-border px-6 py-5">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-admin-card-foreground">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-admin-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-admin-muted-foreground transition-colors hover:bg-admin-muted hover:text-admin-card-foreground"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-3 border-t border-admin-border px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
