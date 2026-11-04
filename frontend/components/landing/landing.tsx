"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeaturedContent } from "../../lib/api-client";
import { useI18n } from "../../context/i18n-context";
import { SiteCredits } from "../site-footer";
import { pulseSpace, setSpaceProgress } from "../space/space-store";
import { useSpaceScene } from "../space/use-space-scene";
import { CommitGraph } from "./commit-graph";
import { SAMPLE_COMMITS, buildSampleSong, diffClass, seededRandom } from "./landing-data";
import { SampleRoll } from "./sample-roll";
import "./landing.css";

const SECTION_KEYS = ["landing.sec.1", "landing.sec.2", "landing.sec.3", "landing.sec.4", "landing.sec.5", "landing.sec.6", "landing.sec.7"] as const;

type GsapModule = typeof import("gsap").gsap;

function wavePeaks(): string[] {
  const r = seededRandom(5);
  return Array.from({ length: 44 }, (_, i) => `scaleY(${(0.12 + Math.abs(Math.sin(i * 0.5)) * r() * 0.88).toFixed(2)})`);
}

export function Landing({ data, signedIn = false }: { data: FeaturedContent | null; signedIn?: boolean }) {
  const { t, locale } = useI18n();
  useSpaceScene("full", 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const gsapRef = useRef<GsapModule | null>(null);
  const [sel, setSel] = useState(3);
  const song = useMemo(() => buildSampleSong(), []);
  const peaks = useMemo(() => wavePeaks(), []);

  const tally = useMemo(() => {
    const t = { add: 0, del: 0, mod: 0 };
    for (const n of song) {
      const c = diffClass(n, sel - 1, sel);
      if (c === "n-add") t.add++;
      else if (c === "n-del") t.del++;
      else if (c === "n-mod") t.mod++;
    }
    return t;
  }, [song, sel]);

  function select(i: number) {
    if (i === sel) return;
    setSel(i);
    pulseSpace(2);
    const g = gsapRef.current;
    const roll = rollRef.current?.querySelector("svg");
    if (g && roll) g.fromTo(roll, { opacity: 0.35 }, { opacity: 1, duration: 0.6, ease: "power2.out", overwrite: true });
  }

  useEffect(() => {
    const root = rootRef.current;
    const main = document.getElementById("main");
    if (!root || !main) return;
    const scroller: HTMLElement = main;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(root.querySelectorAll<HTMLElement>(".scene"));
    const dots = Array.from(root.querySelectorAll<HTMLElement>(".dots a"));
    const snapMq = window.matchMedia("(min-width: 900px) and (min-height: 640px)");
    let cancelled = false;
    let revert: (() => void) | null = null;

    const setActive = (i: number) =>
      dots.forEach((d, n) => (n === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    const topOf = (s: HTMLElement) => s.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

    const applySnap = () => {
      scroller.style.scrollSnapType = snapMq.matches ? "y mandatory" : "";
      scroller.style.scrollBehavior = snapMq.matches && !reduce ? "smooth" : "";
    };
    applySnap();
    snapMq.addEventListener("change", applySnap);

    let lockedUntil = 0;
    let lastWheel = 0;
    const current = () => {
      const y = scroller.scrollTop + scroller.clientHeight / 2;
      let k = 0;
      sections.forEach((s, i) => {
        if (topOf(s) <= y) k = i;
      });
      return k;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX) || !snapMq.matches) return;
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      e.preventDefault();
      if (now < lockedUntil || (gap < 120 && now < lockedUntil + 600)) {
        if (gap < 120) lockedUntil = Math.max(lockedUntil, now + 120);
        return;
      }
      if (Math.abs(e.deltaY) < 4) return;
      const next = Math.max(0, Math.min(sections.length - 1, current() + (e.deltaY > 0 ? 1 : -1)));
      lockedUntil = now + 800;
      scroller.scrollTo({ top: topOf(sections[next]), behavior: reduce ? "auto" : "smooth" });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });

    let io: IntersectionObserver | null = null;
    function observeStatically() {
      root!.dataset.glide = "off";
      io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return;
            const i = sections.indexOf(e.target as HTMLElement);
            setSpaceProgress(i);
            setActive(i);
          }),
        { root: scroller, threshold: 0.55 },
      );
      sections.forEach((s) => io!.observe(s));
    }

    if (reduce) observeStatically();
    else {
      void (async () => {
        try {
          const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
          if (cancelled) return;
          gsap.registerPlugin(ScrollTrigger);
          gsapRef.current = gsap;
          root.dataset.glide = "on";
          const IN = { duration: 0.8, ease: "power2.out", overwrite: "auto" as const };
          const OUT = { duration: 0.32, ease: "power2.in", overwrite: "auto" as const };

          const ctx = gsap.context(() => {
            const q = (sel: string, from: ParentNode = root) => Array.from(from.querySelectorAll<HTMLElement>(sel));
            gsap.set(q(".s-tools .gmrow, .s-tools .pads span, .s-tools .wave, .s-how .step, .s-hist .g-edge, .s-hist .cstar, .s-hist .dec"), { opacity: 0 });

            ScrollTrigger.create({
              trigger: root,
              scroller,
              start: "top top",
              end: "bottom bottom",
              onUpdate: (self) => setSpaceProgress(self.progress * (sections.length - 1)),
            });

            const entrances: Record<string, (sec: HTMLElement) => void> = {
              s2(sec) {
                const cols = q(".col", sec);
                const dotsEl = q(".dot", sec);
                const ltr = q(".ltr", sec);
                const word = q(".word", sec);
                const staff = sec.querySelector<HTMLElement>(".name-staff");
                const tag = sec.querySelector<HTMLElement>(".tagline");
                const row = sec.querySelector<HTMLElement>(".name-row")!.getBoundingClientRect();
                const cx = row.left + row.width / 2;
                dotsEl.forEach((d, i) => {
                  const r = cols[i].getBoundingClientRect();
                  gsap.set(d, { x: cx - (r.left + r.width / 2), opacity: 0, scale: 0.4 });
                });
                gsap.set(ltr, { opacity: 0, scale: 0.6 });
                gsap.set(word, { opacity: 0, y: 14 });
                gsap.set([staff, tag], { opacity: 0 });
                gsap.set(tag, { y: 14 });
                gsap
                  .timeline({ defaults: { overwrite: "auto" } })
                  .to(dotsEl, { opacity: 1, scale: 1, duration: 0.7, stagger: 0.06, ease: "power2.out" })
                  .to(dotsEl, { x: 0, duration: 1.1, ease: "power3.out" }, "+=0.1")
                  .to(staff, { opacity: 1, duration: 0.8, ease: "power2.out" }, "<0.2")
                  .to(dotsEl, { opacity: 0, scale: 0.2, duration: 0.5, stagger: 0.08, ease: "power2.in" }, "+=0.1")
                  .to(ltr, { opacity: 1, scale: 1, duration: 0.8, stagger: 0.08, ease: "power2.out" }, "<0.15")
                  .to(word, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power2.out" }, "-=0.2")
                  .to(tag, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, "-=0.3");
              },
              s3(sec) {
                gsap.fromTo(q(".g-edge", sec), { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out", stagger: 0.1, overwrite: "auto" });
                gsap.fromTo(q(".cstar, .dec", sec), { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.out", stagger: 0.09, delay: 0.2, overwrite: "auto" });
              },
              s5(sec) {
                gsap.fromTo(sec.querySelector(".rail-line"), { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power2.out", overwrite: "auto" });
                gsap.fromTo(q(".step", sec), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.28, delay: 0.15, overwrite: "auto" });
              },
              s6(sec) {
                gsap.fromTo(q(".tile", sec), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.14, delay: 0.1, overwrite: "auto" });
                gsap.fromTo(q(".gmrow", sec), { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out", stagger: 0.09, delay: 0.3, overwrite: "auto" });
                gsap.fromTo(sec.querySelector(".wave"), { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out", delay: 0.5, overwrite: "auto" });
                gsap.fromTo(q(".pads span", sec), { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out", stagger: 0.05, delay: 0.4, overwrite: "auto" });
              },
            };

            const enter = (i: number) => {
              const sec = sections[i];
              setActive(i);
              const rv = q("[data-rv]", sec);
              if (rv.length) {
                gsap.killTweensOf(rv);
                gsap.fromTo(rv, { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.1, delay: 0.05, clearProps: "transform", ...IN });
              }
              entrances[sec.id]?.(sec);
            };
            const exit = (i: number) => {
              const sec = sections[i];
              const lift = q("[data-rv], .step, .tile, .name-staff, .tagline, .dot, .ltr, .word", sec);
              const fade = q(".cstar, .dec, .g-edge, .gmrow, .pads span, .wave", sec);
              if (lift.length) {
                gsap.killTweensOf(lift);
                gsap.to(lift, { opacity: 0, y: -12, ...OUT });
              }
              if (fade.length) {
                gsap.killTweensOf(fade);
                gsap.to(fade, { opacity: 0, ...OUT });
              }
            };
            sections.forEach((sec, i) => {
              ScrollTrigger.create({
                trigger: sec,
                scroller,
                start: "top 58%",
                end: "bottom 42%",
                onEnter: () => enter(i),
                onEnterBack: () => enter(i),
                onLeave: () => exit(i),
                onLeaveBack: () => exit(i),
              });
            });
          }, root);
          revert = () => ctx.revert();

          void document.fonts?.ready.then(() => !cancelled && ScrollTrigger.refresh());
        } catch {
          if (!cancelled) observeStatically();
        }
      })();
    }

    return () => {
      cancelled = true;
      revert?.();
      io?.disconnect();
      gsapRef.current = null;
      scroller.removeEventListener("wheel", onWheel);
      snapMq.removeEventListener("change", applySnap);
      scroller.style.scrollSnapType = "";
      scroller.style.scrollBehavior = "";
      setSpaceProgress(null);
    };
  }, []);

  const commit = SAMPLE_COMMITS[sel];
  const community = data ? (data.trending_projects.length ? data.trending_projects : data.featured_projects).slice(0, 3) : [];

  return (
    <div ref={rootRef} className="lnd" data-glide="pending">
      <nav className="dots" aria-label={t("landing.sections")}>
        {SECTION_KEYS.map((key, i) => (
          <a key={key} href={`#s${i + 1}`} aria-label={t("landing.dot", { n: i + 1, name: t(key) })} aria-current={i === 0 ? "true" : undefined}>
            <i />
          </a>
        ))}
      </nav>

      <section className="scene s-hero" id="s1" aria-labelledby="h1">
        <div className="copy">
          <p className="eyebrow" data-rv>{t("landing.eyebrow")}</p>
          <h1 id="h1" data-rv>{t("landing.heroTitle1")}<br />{t("landing.heroTitle2")}</h1>
          <p className="lead" data-rv>{t("landing.heroLead")}</p>
          <div className="actions" data-rv>
            {signedIn ? (
              <Link className="btn btn-primary" href="/">{t("landing.backHome")}</Link>
            ) : (
              <Link className="btn btn-primary" href="/register">{t("landing.start")}</Link>
            )}
            <Link className="btn btn-line" href="/explore">{t("landing.explorePublic")}</Link>
          </div>
        </div>
        <p className="cue" data-rv aria-hidden="true"><span className="cue-line" />{t("landing.cue")}</p>
      </section>

      <section className="scene s-name" id="s2" aria-labelledby="h2">
        <h2 className="sr-only" id="h2">STAVE: Source Tracking and Version Control Environment</h2>
        <div className="name" aria-hidden="true">
          <svg className="name-staff" viewBox="0 0 1000 60" preserveAspectRatio="none">
            <g>
              {[0, 1, 2, 3, 4].map((i) => (
                <line key={i} x1={0} x2={1000} y1={8 + i * 11} y2={8 + i * 11} />
              ))}
            </g>
          </svg>
          <div className="name-row">
            {[
              ["S", "S", "ource"],
              ["T", "T", "racking"],
              ["A", "a", "nd"],
              ["V", "V", "ersion Control"],
              ["E", "E", "nvironment"],
            ].map(([letter, initial, rest]) => (
              <div className="col" key={letter}>
                <span className="dot" />
                <span className="ltr" translate="no">{letter}</span>
                <span className="word"><b>{initial}</b>{rest}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="tagline">{t("landing.tagline")}</p>
      </section>

      <section className="scene s-hist" id="s3" aria-labelledby="h3">
        <div className="hist">
          <div className="copy">
            <p className="eyebrow" data-rv>{t("landing.history")}</p>
            <h2 id="h3" data-rv>{t("landing.historyTitle")}</h2>
            <p className="lead" data-rv>{t("landing.historyLead")}</p>
            <div className="detail panel" data-rv aria-live="polite">
              <p className="d-top">
                <span className="hash">{commit.hash}</span>
                <span className="d-meta">{commit.author} · {commit.when} · {t(commit.ago.key, { n: commit.ago.n })}</span>
              </p>
              <p className="d-msg">{commit.msg}</p>
              <p className="tally">
                <span className="a"><b>{tally.add}</b> {t("landing.added")}</span>
                <span className="d"><b>{tally.del}</b> {t("landing.removed")}</span>
                <span className="m"><b>{tally.mod}</b> {t("landing.revoiced")}</span>
              </p>
            </div>
            <p className="sample-note" data-rv>{t("landing.sampleNote")}</p>
          </div>
          <div className="stage">
            <div className="panel graph-wrap" data-rv>
              <div className="graph-host">
                <CommitGraph commits={SAMPLE_COMMITS} selected={sel} onSelect={select} />
              </div>
            </div>
            <div className="panel roll-wrap" data-rv>
              <div ref={rollRef} className="roll-host">
                <SampleRoll
                  notes={song}
                  from={sel - 1}
                  to={sel}
                  label={t("landing.rollLabel", { from: sel > 0 ? SAMPLE_COMMITS[sel - 1].hash : t("landing.empty"), to: commit.hash })}
                />
              </div>
              <p className="legend" aria-label={t("landing.legend")}>
                <span><i className="a" />{t("landing.legendAdded")}</span>
                <span><i className="d" />{t("landing.legendRemoved")}</span>
                <span><i className="m" />{t("landing.legendVelocity")}</span>
                <span><i className="k" />{t("landing.legendUnchanged")}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="scene s-why" id="s4" aria-labelledby="h4">
        <div className="why">
          <div className="copy">
            <p className="eyebrow" data-rv>{t("landing.whyEyebrow")}</p>
            <h2 id="h4" data-rv>{t("landing.whyTitle")}</h2>
            <ul className="points">
              <li data-rv><b>{t("landing.why1")}</b> {t("landing.why1b")}</li>
              <li data-rv><b>{t("landing.why2")}</b> {t("landing.why2b")}</li>
              <li data-rv><b>{t("landing.why3")}</b> {t("landing.why3b")}</li>
            </ul>
          </div>
          <div className="compare">
            <div className="panel chaos" data-rv>
              <h3>{t("landing.without")}</h3>
              <ul className="files" aria-label={t("landing.messyFiles")}>
                <li>rainy_final.mid</li>
                <li>rainy_final2.mid</li>
                <li>rainy_final_REAL.mid</li>
                <li>rainy_final_REAL (copy).mid</li>
                <li>rainy_ok_THIS_ONE.mid</li>
              </ul>
              <p className="note">{t("landing.messyNote")}</p>
            </div>
            <div className="panel order" data-rv>
              <h3>{t("landing.with")}</h3>
              <ol className="chain" aria-label={t("landing.cleanChain")}>
                {SAMPLE_COMMITS.slice(0, 5).map((c) => (
                  <li key={c.hash}>
                    <span className="st" />
                    <span>{c.msg.length > 38 ? `${c.msg.slice(0, 36)}…` : c.msg}</span>
                    <span className="when">{c.when}</span>
                  </li>
                ))}
              </ol>
              <p className="note">{t("landing.cleanNote")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="scene s-how" id="s5" aria-labelledby="h5">
        <div className="how">
          <div className="copy">
            <p className="eyebrow" data-rv>{t("landing.howEyebrow")}</p>
            <h2 id="h5" data-rv>{t("landing.howTitle")}</h2>
          </div>
          <div className="rail" aria-hidden="true"><span className="rail-line" /></div>
          <ol className="steps">
            <li className="step panel">
              <span className="num">01</span>
              <svg viewBox="0 0 80 40" aria-hidden="true"><circle cx="40" cy="20" r="7" className="st-draft" /></svg>
              <h3>{t("landing.stepDraftTitle")}</h3>
              <p>{t("landing.stepDraft")}</p>
            </li>
            <li className="step panel">
              <span className="num">02</span>
              <svg viewBox="0 0 80 40" aria-hidden="true"><line x1="6" y1="20" x2="74" y2="20" className="st-line" /><circle cx="24" cy="20" r="6" className="st-star" /><circle cx="56" cy="20" r="6" className="st-star lit" /></svg>
              <h3>{t("landing.stepCommitTitle")}</h3>
              <p>{t("landing.stepCommit")}</p>
            </li>
            <li className="step panel">
              <span className="num">03</span>
              <svg viewBox="0 0 80 40" aria-hidden="true"><path d="M6 12H74" className="st-line" /><path d="M30 12C42 12 40 30 52 30H74" className="st-line teal" /><circle cx="30" cy="12" r="5" className="st-star" /><circle cx="52" cy="30" r="5" className="st-star teal" /></svg>
              <h3>{t("landing.stepBranchTitle")}</h3>
              <p>{t("landing.stepBranch")}</p>
            </li>
            <li className="step panel">
              <span className="num">04</span>
              <svg viewBox="0 0 80 40" aria-hidden="true"><path d="M6 12H74" className="st-line" /><path d="M6 30H40C54 30 52 12 66 12" className="st-line teal" /><circle cx="66" cy="12" r="6" className="st-star hollow" /></svg>
              <h3>{t("landing.stepMergeTitle")}</h3>
              <p>{t("landing.stepMerge")}</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="scene s-tools" id="s6" aria-labelledby="h6">
        <div className="tools">
          <div className="copy">
            <p className="eyebrow" data-rv>{t("landing.toolboxEyebrow")}</p>
            <h2 id="h6" data-rv>{t("landing.toolboxTitle")}</h2>
          </div>
          <div className="bento">
            <article className="tile panel t-gm">
              <h3><span className="big">128</span> {t("landing.gmTitle")}</h3>
              <p>{t("landing.gmText")}</p>
              <div className="gm" aria-hidden="true">
                {Array.from({ length: 8 }, (_, r) => (
                  <div className="gmrow" key={r}>
                    {Array.from({ length: 16 }, (_, c) => <i key={c} />)}
                  </div>
                ))}
              </div>
            </article>
            <article className="tile panel t-drum">
              <h3>{t("landing.drumTitle")}</h3>
              <p>{t("landing.drumText")}</p>
              <div className="pads" aria-hidden="true">
                {["Kick", "Snare", "Hat", "Clap", "Tom", "Ride", "Crash", "Perc"].map((p) => <span key={p}>{p}</span>)}
              </div>
            </article>
            <article className="tile panel t-own">
              <h3>{t("landing.ownTitle")}</h3>
              <p>{t("landing.ownText")}</p>
              <div className="wave" aria-hidden="true">
                {peaks.map((t, i) => <i key={i} style={{ transform: t }} />)}
              </div>
            </article>
            <article className="tile panel t-out">
              <h3>{t("landing.exportTitle")}</h3>
              <p>{t("landing.exportText")}</p>
              <ul className="chips" aria-label={t("landing.exportFormats")}>
                <li>.mid</li><li>WAV</li><li>MP3</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="scene s-cta" id="s7" aria-labelledby="h7">
        <div className="cta copy">
          <h2 id="h7" data-rv>{t("landing.ctaTitle")}</h2>
          <p className="lead" data-rv>{t("landing.ctaLead")}</p>
          <div className="actions" data-rv>
            <Link className="btn btn-primary btn-lg" href={signedIn ? "/projects/new" : "/register"}>{t("landing.ctaTitle")}</Link>
            <Link className="btn btn-line btn-lg" href="/explore">{t("landing.browse")}</Link>
          </div>
          {community.length > 0 && data && (
            <div className="live" data-rv>
              <p className="live-label">
                {t("landing.live", { projects: data.stats.total_projects.toLocaleString(locale), people: data.stats.total_users.toLocaleString(locale) })}
              </p>
              {community.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <b>{p.name}</b>
                  <span>
                    {p.owner.display_name ?? p.owner.username ?? t("ui.unknownUser")} · {t("ui.plays", { n: p.play_count.toLocaleString(locale) })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <footer className="foot" data-rv>
          <Link className="brand" href="/" translate="no" aria-label={t("landing.brandHome")}>STAVE</Link>
          <nav aria-label={t("landing.footerNav")}>
            <Link href="/explore">{t("nav.explore")}</Link>
            <Link href="/rankings">{t("nav.rankings")}</Link>
            {signedIn ? (
              <Link href="/">{t("nav.home")}</Link>
            ) : (
              <>
                <Link href="/login">{t("nav.signIn")}</Link>
                <Link href="/register">{t("landing.signUp")}</Link>
              </>
            )}
          </nav>
          <p>© 2026 STAVE</p>
          <SiteCredits className="credits" />
        </footer>
      </section>
    </div>
  );
}
