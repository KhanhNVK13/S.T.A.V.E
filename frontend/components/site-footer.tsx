export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-page px-4 py-4 text-center text-xs text-slate-400">
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
            className="underline hover:text-slate-600"
          >
            gleitz/midi-js-soundfonts
          </a>{" "}
          (CC BY 3.0). Drum kits: GeneralUser GS by S. Christian Collins,{" "}
          <a
            href="https://schristiancollins.com/generaluser.php"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-600"
          >
            schristiancollins.com
          </a>{" "}
          (GeneralUser GS License v2.0).{" "}
          <a
            href="/instruments/CREDITS.txt"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-600"
          >
            Full credits
          </a>
        </p>
      </div>
    </footer>
  );
}
