import { Loader2 } from "lucide-react"

export default function LoadingScreen({ label = "Đang tải..." }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-admin-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-admin-primary" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}
