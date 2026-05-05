export interface Exercise {
  id: string
  title: string
  type: "reading" | "listening" | "writing"
  language: "english" | "japanese"
  part: number
  totalQuestions: number
  duration: number // minutes
  difficulty: "beginner" | "intermediate" | "advanced"
  completedCount: number
  description: string
  image: string
}

export interface Question {
  id: number
  text: string
  options: { label: string; value: string }[]
  correctAnswer: string
}

export interface ReadingPassage {
  title: string
  content: string
  questions: Question[]
}

export interface ListeningExercise {
  title: string
  audioTitle: string
  audioDuration: number // seconds
  questions: Question[]
}

export interface WritingTask {
  title: string
  prompt: string
  minWords: number
  maxWords: number
  targetWords: number
  timeLimit: number // minutes
  structure: { label: string; description: string }[]
  vocabulary: { word: string; meaning: string; example: string }[]
  sampleEssay: string
}
