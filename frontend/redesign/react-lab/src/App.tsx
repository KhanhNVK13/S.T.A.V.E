import { useEffect, useState } from "react"
import { AppShell, PublicShell } from "@/components/shells"
import { Explore } from "@/views/explore"
import { Help } from "@/views/help"
import { Projects } from "@/views/projects"
import { Rankings } from "@/views/rankings"
import { Settings } from "@/views/settings"

function useHash() {
  const [h, setH] = useState(() => window.location.hash || "#/projects")
  useEffect(() => {
    const on = () => setH(window.location.hash || "#/projects")
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return h
}

export default function App() {
  const h = useHash()
  if (h === "#/explore") return <PublicShell active={h}><Explore /></PublicShell>
  if (h === "#/rankings") return <PublicShell active={h}><Rankings /></PublicShell>
  if (h === "#/help") return <AppShell active={h}><Help /></AppShell>
  if (h === "#/settings") return <AppShell active={h}><Settings /></AppShell>
  return <AppShell active="#/projects"><Projects /></AppShell>
}
