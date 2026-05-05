import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantClasses = {
    default: "gradient-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    success: "gradient-success text-success-foreground",
    warning: "gradient-warm text-warning-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-border text-foreground bg-card",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-smooth",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
