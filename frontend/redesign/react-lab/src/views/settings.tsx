import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const THEMES = [
  ["Sand and moss", ["#ddd6c6", "#ebe6d9", "#2b5bd7", "#121212"]],
  ["Slate gray", ["#d9dadb", "#e8e9ea", "#2b5bd7", "#26282b"]],
  ["Dark wood", ["#d8c9b8", "#e9ddcf", "#2b5bd7", "#2d2620"]],
] as const

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 md:grid-cols-[300px_1fr] md:gap-8">
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1.5 text-sm text-muted-foreground">{desc}</p></div>
      <div className="grid max-w-[640px] gap-4 rounded-2xl bg-secondary p-5">{children}</div>
    </section>
  )
}

function Toggle({ id, title, desc, on }: { id: string; title: string; desc: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id}><b className="block text-sm font-medium">{title}</b><span className="text-sm text-muted-foreground">{desc}</span></label>
      <Switch id={id} defaultChecked={on} />
    </div>
  )
}

export function Settings() {
  const [theme, setTheme] = useState(0)
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Profile, appearance and the editor’s default settings.</p>
      <div className="mt-8">
        <Row title="Profile" desc="Your name and avatar shown on your public projects.">
          <label className="grid gap-2 text-sm font-medium">Display name<Input defaultValue="Khanh" autoComplete="nickname" /></label>
          <label className="grid gap-2 text-sm font-medium">Email<Input type="email" defaultValue="khanh@stave.app" autoComplete="email" spellCheck={false} /></label>
          <div><Button size="sm" className="rounded-full">Save changes</Button></div>
        </Row>
        <Row title="Appearance" desc="Pick a base tone for the whole app. Status colors for added, removed and conflict never change.">
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Theme">
            {THEMES.map(([name, sw], i) => (
              <button key={name} onClick={() => setTheme(i)} aria-pressed={theme === i}
                className={"grid gap-2 rounded-xl border-2 bg-background p-2.5 text-left " + (theme === i ? "border-foreground" : "border-transparent")}>
                <span className="flex h-13 overflow-hidden rounded-md">{sw.map((c) => <i key={c} className="flex-1" style={{ background: c }} />)}</span>
                <b className="text-sm font-medium">{name}</b>
              </button>
            ))}
          </div>
        </Row>
        <Row title="Editor" desc="Default behavior when you open a project.">
          <Toggle id="t1" title="Autosave drafts" desc="Save on every change" on />
          <Toggle id="t2" title="Tips strip for newcomers" desc="Shown at the top of the editor" on />
          <Toggle id="t3" title="Snap notes to the grid while drawing" desc="Quantize theo 1/16" on />
        </Row>
      </div>
    </>
  )
}
