import { Link } from "react-router-dom";
import { LogoMark } from "@/components/logo-mark";

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <LogoMark className="h-12 w-12 text-oxblood" />
      <h1 className="mt-8 font-display text-display-sm text-ink">Nothing was foretold here.</h1>
      <p className="mt-4 text-[0.98rem] leading-relaxed text-ink-soft">
        That page does not exist. The board is where everything lives.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/markets"
          className="rounded-sm border border-ink px-4 py-2 text-[0.8rem] uppercase tracking-[0.1em] text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          The board
        </Link>
        <Link
          to="/"
          className="rounded-sm border border-line-strong px-4 py-2 text-[0.8rem] uppercase tracking-[0.1em] text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
