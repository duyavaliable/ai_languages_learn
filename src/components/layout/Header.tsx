import { Link, useLocation } from "react-router-dom"
import { BookOpen, Headphones, PenTool, User, Settings, Bell, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "English", path: "/?lang=english", icon: BookOpen },
  { label: "Japanese", path: "/?lang=japanese", icon: BookOpen },
]

export function Header() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">
            Lingua<span className="text-gradient-primary">AI</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname + location.search === link.path ||
              (link.path === "/?lang=english" && location.pathname === "/" && !location.search)
            return (
              <Link
                key={link.label}
                to={link.path}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-smooth",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
            <Settings className="h-4 w-4" />
          </Button>
          <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full gradient-primary text-xs font-semibold text-primary-foreground">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    </header>
  )
}

export function Sidebar({
  selectedSkills,
  onToggleSkill,
  selectedParts,
  onTogglePart,
  selectedLanguage,
  onSelectLanguage,
}: {
  selectedSkills: string[]
  onToggleSkill: (skill: string) => void
  selectedParts: number[]
  onTogglePart: (part: number) => void
  selectedLanguage: string
  onSelectLanguage: (lang: string) => void
}) {
  const skills = [
    { id: "reading", label: "Reading", icon: BookOpen },
    { id: "listening", label: "Listening", icon: Headphones },
    { id: "writing", label: "Writing", icon: PenTool },
  ]

  const parts = [1, 2, 3]
  const languages = ["english", "japanese"]

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card p-5">
      <div className="space-y-6">
        {/* Language Filter */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Language
          </h3>
          <div className="space-y-1">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => onSelectLanguage(lang)}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-smooth",
                  selectedLanguage === lang
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Skill Filter */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Skill
          </h3>
          <div className="space-y-1">
            {skills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onToggleSkill(skill.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-smooth",
                  selectedSkills.includes(skill.id)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <skill.icon className="h-4 w-4" />
                {skill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Part Filter */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Part
          </h3>
          <div className="flex flex-wrap gap-2">
            {parts.map((part) => (
              <button
                key={part}
                onClick={() => onTogglePart(part)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-smooth",
                  selectedParts.includes(part)
                    ? "gradient-primary text-primary-foreground shadow-elegant"
                    : "border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                )}
              >
                {part}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
