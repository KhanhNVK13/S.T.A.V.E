export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-page px-5 py-4 text-center text-[11px] text-muted">
        <p>
          STAVE — Source Tracking and Version Control Environment for Music
          Projects.
        </p>
        <p className="mt-1">
          Instrument sounds: FluidR3_GM SoundFont by Frank Wen, via{" "}
          <a
            href="https://github.com/gleitz/midi-js-soundfonts"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            gleitz/midi-js-soundfonts
          </a>{" "}
          (CC BY 3.0). Drum kits: GeneralUser GS by S. Christian Collins,{" "}
          <a
            href="https://schristiancollins.com/generaluser.php"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            schristiancollins.com
          </a>{" "}
          (GeneralUser GS License v2.0).{" "}
          <a
            href="/instruments/CREDITS.txt"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Full credits
          </a>
        </p>
      </div>
    </footer>
  );
}
