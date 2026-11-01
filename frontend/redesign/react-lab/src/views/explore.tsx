import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Search, Star } from "lucide-react"
import { StaffThumb } from "@/components/staff-thumb"
import { publicProjects } from "@/data"

const GENRES = ["All", "Lo-fi", "Jazz", "Electronic", "Classical", "Film score"]
const FEATURED = ["from-0", "from-1", "from-2"]
const FEAT_BG = ["bg-[#dceeb1]", "bg-[#f3c9b6]", "bg-[#c8e6cd]"]

export function Explore() {
  const [genre, setGenre] = useState("All")
  const [q, setQ] = useState("")
  const list = useMemo(
    () => publicProjects.filter((p) => (genre === "All" || p.genre === genre) && (p.name + p.author).toLowerCase().includes(q.toLowerCase())),
    [genre, q],
  )
  const featured = [publicProjects[3], publicProjects[1], publicProjects[0]]
  return (
    <>
      <h1 className="text-[clamp(3rem,1.5rem+5vw,6rem)] font-light leading-[.95] tracking-[-0.045em]">Explore</h1>
      <p className="mt-4 max-w-[56ch] text-lg font-light text-muted-foreground">
        Public music from the community. Open a project to listen, browse its commit history, or fork it to remix.{" "}
        <a href="#/help" className="underline underline-offset-4">What is a fork?</a>
      </p>
      <label className="relative mt-7 block max-w-[560px]">
        <Search className="absolute left-5 top-4 size-5 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search by song title or author…" aria-label="Search projects"
          className="h-14 w-full rounded-full border bg-background pl-13 pr-5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>

      <div className="my-8 flex flex-wrap gap-2" role="group" aria-label="Genre">
        {GENRES.map((g) => (
          <button key={g} onClick={() => setGenre(g)} aria-pressed={genre === g}
            className={"h-10 rounded-full border px-5 text-[15px] font-medium transition-colors " + (genre === g ? "border-foreground bg-foreground text-background" : "hover:border-foreground")}>{g}</button>
        ))}
      </div>

      <h2 className="mb-4 text-3xl font-normal tracking-tight">Featured this week</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {featured.map((p, i) => (
          <motion.a key={FEATURED[i]} href="#/projects" whileHover={{ y: -4 }} className={"flex min-h-[340px] flex-col justify-between rounded-3xl p-6 " + FEAT_BG[i]}>
            <div className="grid h-[150px] place-items-center rounded-2xl bg-white/70"><StaffThumb branches={p.branches} merged={p.merged} className="h-full w-full" /></div>
            <div>
              <h3 className="text-3xl font-normal leading-tight tracking-tight">{p.name}</h3>
              <p className="mt-2 text-[15px]">{p.author} · {p.genre} · {p.tempo}</p>
              <p className="mt-4 flex gap-4 text-sm"><span>{p.stars} sao</span><span>{p.forks} fork</span><span>{p.commits} commit</span></p>
            </div>
          </motion.a>
        ))}
      </div>

      <h2 className="mb-5 mt-14 text-3xl font-normal tracking-tight">Recently updated  <span className="text-lg text-muted-foreground">({list.length})</span></h2>
      {list.length === 0 ? (
        <p className="rounded-3xl bg-secondary p-10 text-center text-muted-foreground">No music matches. Try removing some filters.</p>
      ) : (
        <div className="grid gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
          {list.map((p, i) => (
            <motion.a key={p.name} href="#/projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="group block">
              <div className="grid h-[120px] place-items-center rounded-2xl bg-secondary transition-colors group-hover:bg-[#dceeb1]"><StaffThumb branches={p.branches} merged={p.merged} className="h-full w-full" /></div>
              <h3 className="mt-3 font-semibold tracking-tight">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{p.author} · {p.genre}</p>
              <p className="mt-2 flex items-center gap-3 rounded-lg bg-secondary px-2.5 py-1.5 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Star className="size-3.5" />{p.stars}</span><span>{p.forks} fork</span><span>{p.branches} branch</span>
              </p>
            </motion.a>
          ))}
        </div>
      )}
    </>
  )
}
