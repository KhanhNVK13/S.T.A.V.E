import { motion } from "motion/react"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StaffThumb } from "@/components/staff-thumb"
import { appProjects } from "@/data"

const stats = [["Projects", "4"], ["Commits this week", "9"], ["Open branch", "4"], ["Awaiting merge", "1"]]

function StateBadge({ state }: { state: string }) {
  if (state === "Awaiting merge") return <Badge className="rounded-full">{state}</Badge>
  if (state === "Has draft") return <Badge className="rounded-full border-amber-300 bg-amber-100 text-amber-900">{state}</Badge>
  return <Badge variant="secondary" className="rounded-full">{state}</Badge>
}

export function Projects() {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My projects</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
            Your open draft sits at the top of the list so you can continue exactly where you stopped.{" "}
            <a href="#/help" className="underline underline-offset-4">What are commits, branches and merges?</a>
          </p>
        </div>
        <Dialog>
          <DialogTrigger className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95">
            <Plus className="size-4" />New project
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
            <label className="grid gap-2 text-sm font-medium">Project name<Input placeholder="Example: Rainy Saigon Night…" /></label>
            <Button className="mt-2 rounded-full">Create and open editor</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1.5 md:grid-cols-4">
        {stats.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.35 }}>
            <Card className="border-0 shadow-none ring-0"><CardContent className="px-4 py-3"><div className="text-sm font-medium">{k}</div><div className="mt-1 text-2xl tabular-nums">{v}</div></CardContent></Card>
          </motion.div>
        ))}
      </div>

      <Table className="mt-8">
        <TableHeader>
          <TableRow><TableHead>Projects</TableHead><TableHead>Latest commit</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Updated</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {appProjects.map((p, i) => (
            <motion.tr key={p.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + 0.06 * i }} whileHover={{ backgroundColor: "oklch(0.975 0.004 95)" }} className="border-b">
              <TableCell>
                <div className="flex items-center gap-3">
                  <StaffThumb branches={p.branches} merged={p.merged} />
                  <div><div className="font-semibold">{p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.file}</div></div>
                </div>
              </TableCell>
              <TableCell className="max-w-[240px] truncate text-muted-foreground">{p.last}</TableCell>
              <TableCell><StateBadge state={p.state} /></TableCell>
              <TableCell className="text-right text-muted-foreground">{p.when}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant={p.state === "Awaiting merge" ? "default" : "outline"} className="rounded-full">{p.state === "Awaiting merge" ? "Resolve conflicts" : "Open editor"}</Button>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
