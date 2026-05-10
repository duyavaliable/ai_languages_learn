import React from "react"
import { Link } from "react-router-dom"
import { BookOpen, Headphones, PenTool, Clock, Users, ChevronRight } from "lucide-react"
import type { Exercise } from "../types"
import { cn } from "../lib/utils"
import { assetUrl } from "../lib/asset"

const typeConfig = {
  reading: { icon: BookOpen, color: "bg-primary/10 text-primary" },
  listening: { icon: Headphones, color: "bg-accent/10 text-accent" },
  writing: { icon: PenTool, color: "bg-success/10 text-success" },
} as const

const difficultyConfig = {
  beginner: { label: "Beginner", badge: "success" as const },
  intermediate: { label: "Intermediate", badge: "warning" as const },
  advanced: { label: "Advanced", badge: "destructive" as const },
} as const

const defaultImageByType = {
  reading: assetUrl("images/reading-illustration.png"),
  listening: assetUrl("images/listening-illustration.png"),
  writing: assetUrl("images/writing-illustration.png"),
} as const

export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const config = typeConfig[exercise.type as keyof typeof typeConfig] ?? typeConfig.reading
  const Icon = config.icon
  const diff = difficultyConfig[exercise.difficulty as keyof typeof difficultyConfig] ?? difficultyConfig.beginner
  const imageSrc =
    defaultImageByType[exercise.type as keyof typeof defaultImageByType] ||
    exercise.image ||
    defaultImageByType.reading
  const practiceUrl =
    exercise.type === "reading"
      ? `/practice/reading/${exercise.id}`
      : exercise.type === "listening"
        ? `/practice/listening/${exercise.id}`
        : `/practice/writing/${exercise.id}`

  return React.createElement(
    Link,
    { to: practiceUrl },
    React.createElement(
      "div",
      {
        className:
          "group cursor-pointer overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card transition-smooth hover:-translate-y-1 hover:shadow-card-hover",
      },
      React.createElement(
        "div",
        { className: "relative h-36 overflow-hidden" },
        React.createElement("img", {
          src: imageSrc,
          alt: exercise.title,
          className: "h-full w-full object-cover transition-smooth group-hover:scale-105",
          loading: "lazy",
        }),
        React.createElement("div", {
          className: "absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent",
        }),
        React.createElement(
          "div",
          { className: "absolute bottom-3 left-3 right-3 flex items-center justify-between" },
          React.createElement(
            "span",
            {
              className: cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-primary-foreground",
                diff.badge === "success"
                  ? "gradient-success"
                  : diff.badge === "warning"
                    ? "gradient-warm"
                    : "bg-destructive"
              ),
            },
            diff.label
          ),
          React.createElement(
            "span",
            { className: "text-xs font-medium text-primary-foreground/90" },
            `Part ${exercise.part}`
          )
        )
      ),
      React.createElement(
        "div",
        { className: "p-4" },
        React.createElement(
          "div",
          { className: "mb-2.5 flex items-center gap-2" },
          React.createElement(
            "span",
            { className: cn("flex h-6 w-6 items-center justify-center rounded-md", config.color) },
            React.createElement(Icon, { className: "h-3.5 w-3.5" })
          ),
          React.createElement(
            "span",
            { className: "text-xs font-medium uppercase tracking-wider text-muted-foreground" },
            `${exercise.language} - ${exercise.type}`
          )
        ),
        React.createElement(
          "h3",
          { className: "mb-1.5 text-sm font-semibold leading-snug text-foreground line-clamp-2 transition-smooth group-hover:text-primary" },
          exercise.title
        ),
        React.createElement(
          "p",
          { className: "mb-3 text-xs text-muted-foreground line-clamp-2" },
          exercise.description
        ),
        React.createElement(
          "div",
          { className: "flex items-center justify-between border-t border-border pt-3" },
          React.createElement(
            "div",
            { className: "flex items-center gap-3 text-xs text-muted-foreground" },
            React.createElement(
              "span",
              { className: "flex items-center gap-1" },
              React.createElement(Clock, { className: "h-3 w-3" }),
              `${exercise.duration}m`
            ),
            React.createElement(
              "span",
              { className: "flex items-center gap-1" },
              React.createElement(Users, { className: "h-3 w-3" }),
              Number(exercise.completedCount || 0).toLocaleString()
            )
          ),
          React.createElement(ChevronRight, {
            className: "h-4 w-4 text-muted-foreground transition-smooth group-hover:translate-x-0.5 group-hover:text-primary",
          })
        )
      )
    )
  )
}
