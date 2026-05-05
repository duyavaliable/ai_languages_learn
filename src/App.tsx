import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Dashboard } from "@/pages/Dashboard"
import { ReadingPractice } from "@/pages/ReadingPractice"
import { ListeningPractice } from "@/pages/ListeningPractice"
import { WritingPractice } from "@/pages/WritingPractice"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/practice/reading/:id" element={<ReadingPractice />} />
        <Route path="/practice/listening/:id" element={<ListeningPractice />} />
        <Route path="/practice/writing/:id" element={<WritingPractice />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
