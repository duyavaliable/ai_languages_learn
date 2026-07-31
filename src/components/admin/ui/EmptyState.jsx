import { Inbox } from "lucide-react"

export default function EmptyState({ icon: Icon = Inbox, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-admin-muted text-admin-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-admin-card-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-admin-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}
