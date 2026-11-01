import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Compass, FolderOpen, HelpCircle, SlidersHorizontal, Trophy } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar"
import { appProjects } from "@/data"

export const go = (hash: string) => { window.location.hash = hash }

const NAV = [
  ["#/projects", "My projects", FolderOpen],
  ["#/explore", "Explore", Compass],
  ["#/rankings", "Rankings", Trophy],
] as const

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <a href="#/" className="px-4 pt-5 pb-3 font-extrabold tracking-tight" style={{ fontFamily: "Unbounded" }}>STAVE</a>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.map(([h, label, Icon]) => (
                <SidebarMenuItem key={h}>
                  <SidebarMenuButton isActive={active === h} render={<a href={h} />}><Icon />{label}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Recent projects</SidebarGroupLabel>
            <SidebarMenu>
              {appProjects.slice(0, 3).map((p) => (
                <SidebarMenuItem key={p.name}><SidebarMenuButton render={<a href="#/projects" />}>{p.name}</SidebarMenuButton></SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarMenu>
              <SidebarMenuItem><SidebarMenuButton isActive={active === "#/help"} render={<a href="#/help" />}><HelpCircle />Help and glossary</SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton isActive={active === "#/settings"} render={<a href="#/settings" />}><SlidersHorizontal />Settings</SidebarMenuButton></SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <motion.main key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto w-full max-w-[1200px] px-8 py-8">
          {children}
        </motion.main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function PublicShell({ active, children }: { active: string; children: ReactNode }) {
  const links = [["#/explore", "Explore"], ["#/rankings", "Rankings"], ["#/help", "Help"]]
  return (
    <div className="mx-auto max-w-[1440px] px-8 pb-10 pt-6">
      <header className="flex items-center justify-between pb-10">
        <a href="#/" className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Unbounded" }}>STAVE</a>
        <nav className="flex items-center gap-6 text-[15px]">
          {links.map(([h, l]) => (
            <a key={h} href={h} className={"border-b-2 py-1 " + (active === h ? "border-foreground" : "border-transparent hover:border-foreground")}>{l}</a>
          ))}
          <a href="#/projects" className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">My projects</a>
        </nav>
      </header>
      <motion.div key={active} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>{children}</motion.div>
      <footer className="mt-16 flex justify-between border-t pt-5 text-sm text-muted-foreground">
        <span>© 2026 STAVE</span><a href="#/help" className="hover:text-foreground hover:underline">Help and glossary</a>
      </footer>
    </div>
  )
}
