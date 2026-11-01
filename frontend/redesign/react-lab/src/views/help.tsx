import { motion } from "motion/react"
import { glossary } from "@/data"

const BG = ["bg-[#dceeb1]", "bg-secondary", "bg-secondary", "bg-[#f4efe6]"]

const KEYS = [
  ["Select, Draw, Erase", "V  B  E"], ["Play or pause", "Space"], ["Undo, Redo", "Ctrl Z   Ctrl Shift Z"],
  ["Commit", "Ctrl Enter"], ["Move on the note grid", "← → ↑ ↓"], ["Place or remove the note under the cursor", "Enter"],
  ["Select multiple notes", "Select tool, drag a frame, or Ctrl A"], ["Quick find on every page", "Ctrl K"],
]

export function Help() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Help and glossary</h1>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">STAVE borrows how software developers keep their history to keep your music’s history. These are the words you’ll meet, explained with musical examples.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {glossary.map(([t, d, like], i) => (
          <motion.article key={t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className={"rounded-2xl p-6 " + BG[i % 4]}>
            <h2 className="text-xl font-medium tracking-tight">{t}</h2>
            <p className="mt-2 text-[15px]">{d}</p>
            <p className="mt-3 text-sm text-muted-foreground">{like}</p>
          </motion.article>
        ))}
      </div>
      <h2 className="mb-3 mt-12 text-lg font-medium">Editor shortcuts</h2>
      <dl className="max-w-[640px]">
        {KEYS.map(([a, b]) => (
          <div key={a} className="flex justify-between gap-6 border-t py-2.5 text-[15px]"><dt>{a}</dt><dd className="rounded bg-secondary px-2 text-[13px] leading-6 text-muted-foreground">{b}</dd></div>
        ))}
      </dl>
    </>
  )
}
