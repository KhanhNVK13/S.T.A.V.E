import { useState } from "react"
import { motion } from "motion/react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StaffThumb } from "@/components/staff-thumb"
import { publicProjects } from "@/data"

const PERIODS = [["This week", 1], ["This month", 3.4], ["All time", 9]] as const
const BG = ["bg-[#dceeb1]", "bg-[#f4efe6]", "bg-[#c8e6cd]"]

export function Rankings() {
  const [pi, setPi] = useState(0)
  const mult = PERIODS[pi][1]
  const ranked = [...publicProjects].sort((a, b) => b.gain - a.gain).map((p) => ({ ...p, gain: Math.round(p.gain * mult) }))
  return (
    <>
      <h1 className="text-[clamp(3rem,1.5rem+5vw,6rem)] font-light leading-[.95] tracking-[-0.045em]">Rankings</h1>
      <p className="mt-4 max-w-[56ch] text-lg font-light text-muted-foreground">Most-starred projects. Updated daily at 06:00, counted by new stars in the period you choose.</p>
      <div role="tablist" aria-label="Period" className="mt-8 flex gap-6 border-b">
        {PERIODS.map(([l], i) => (
          <button key={l} role="tab" aria-selected={pi === i} onClick={() => setPi(i)}
            className={"-mb-px border-b-2 pb-3 text-sm " + (pi === i ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>

      <div className="my-8 grid gap-4 md:grid-cols-3">
        {ranked.slice(0, 3).map((p, i) => (
          <motion.a key={p.name} href="#/projects" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} whileHover={{ y: -4 }}
            className={"flex min-h-[260px] flex-col justify-between rounded-3xl p-7 " + BG[i]}>
            <div>
              <span className="text-7xl font-extrabold leading-none tracking-tighter" style={{ fontFamily: "Unbounded" }}>{i + 1}</span>
              <h2 className="mt-5 text-2xl font-medium tracking-tight">{p.name}</h2>
              <p className="mt-1 text-[15px]">{p.author} · {p.genre}</p>
            </div>
            <div>
              <div className="h-14 rounded-lg bg-white/60"><StaffThumb branches={p.branches} merged={p.merged} className="h-full w-full" /></div>
              <p className="mt-4 text-[15px]"><b>+{p.gain}</b> stars · total  {p.stars}</p>
            </div>
          </motion.a>
        ))}
      </div>

      <Table>
        <TableHeader><TableRow><TableHead className="w-14">Rank</TableHead><TableHead>Projects</TableHead><TableHead>Genre</TableHead><TableHead className="text-right">New stars</TableHead><TableHead className="text-right">Total stars</TableHead></TableRow></TableHeader>
        <TableBody>
          {ranked.slice(3).map((p, i) => (
            <TableRow key={p.name}>
              <TableCell className="text-lg font-semibold tabular-nums">{i + 4}</TableCell>
              <TableCell><div className="flex items-center gap-3"><StaffThumb branches={p.branches} merged={p.merged} /><div><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.author}</div></div></div></TableCell>
              <TableCell className="text-muted-foreground">{p.genre}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">+{p.gain}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{p.stars}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
