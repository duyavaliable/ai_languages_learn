/*
  Stat card matching the User dashboard tiles (icon chip + label + big value).
*/
const iconTones = {
  primary: "bg-admin-primary-soft text-admin-primary",
  success: "bg-admin-success-soft text-admin-success",
  warning: "bg-admin-warning-soft text-admin-warning",
  teal: "bg-admin-teal-soft text-admin-teal",
}

export default function StatCard({ icon: Icon, label, value, hint, tone = "primary" }) {
  return (
    <div className="flex items-center gap-4 rounded-admin border border-admin-border bg-admin-card p-5 shadow-admin-card">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconTones[tone] || iconTones.primary}`}
      >
        {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-admin-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight text-admin-card-foreground">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-admin-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}
