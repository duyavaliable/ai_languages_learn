/*
  Reusable badge replacing the old inline `roleBadgeStyle` / `levelBadge`
  helpers. Tone selects a color pairing from the Lingua palette.
*/
const tones = {
  primary: "bg-admin-primary-soft text-admin-primary",
  success: "bg-admin-success-soft text-admin-success",
  warning: "bg-admin-warning-soft text-admin-warning",
  danger: "bg-admin-danger-soft text-admin-danger",
  teal: "bg-admin-teal-soft text-admin-teal",
  neutral: "bg-admin-muted text-admin-muted-foreground",
}

export default function StatusBadge({ tone = "neutral", children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </span>
  )
}
