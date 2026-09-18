import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LogoMark, Wordmark } from "./logo-mark";
import { NetworkSwitcher } from "./network-switcher";
import { WalletButton } from "./wallet-button";
import { cn } from "./ui";
import { NETWORKS, useNetwork } from "@/lib/network";

/** Marketing and application share one publication: the same paper, the same
 *  rules, a different density. */

const APP_NAV = [
  { to: "/markets", label: "Markets" },
  { to: "/jury", label: "Jury" },
  { to: "/agent", label: "The agent" },
  { to: "/portfolio", label: "Portfolio" },
];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function MarketingLayout() {
  return (
    <>
      <ScrollToTop />
      <MarketingHeader />
      <Outlet />
      <SiteFooter />
    </>
  );
}

function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur-sm">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="Cassandra home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="/#how" className="text-[0.86rem] text-ink-soft transition-colors hover:text-oxblood">
            How it settles
          </a>
          <a href="/#jury" className="text-[0.86rem] text-ink-soft transition-colors hover:text-oxblood">
            The jury
          </a>
          <Link to="/docs" className="text-[0.86rem] text-ink-soft transition-colors hover:text-oxblood">
            Docs
          </Link>
          <Link
            to="/markets"
            className="rounded-sm border border-ink px-4 py-1.5 text-[0.78rem] font-medium uppercase tracking-[0.1em] text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            Open the app
          </Link>
        </nav>
        <button
          type="button"
          className="md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="block h-px w-6 bg-ink" />
          <span className="mt-1.5 block h-px w-6 bg-ink" />
          <span className="mt-1.5 block h-px w-4 bg-ink" />
        </button>
      </div>
      {open ? (
        <div className="border-t border-line bg-paper px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <a href="/#how" onClick={() => setOpen(false)} className="text-ink-soft">How it settles</a>
            <a href="/#jury" onClick={() => setOpen(false)} className="text-ink-soft">The jury</a>
            <Link to="/docs" onClick={() => setOpen(false)} className="text-ink-soft">Docs</Link>
            <Link to="/markets" onClick={() => setOpen(false)} className="font-medium text-oxblood">Open the app →</Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function AppLayout() {
  return (
    <>
      <ScrollToTop />
      <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-6 px-4">
          <Link to="/" aria-label="Cassandra home" className="shrink-0">
            <LogoMark className="h-7 w-7 text-oxblood" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {APP_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-sm px-3 py-1.5 text-[0.84rem] transition-colors",
                    isActive ? "bg-paper-2 font-medium text-ink" : "text-muted hover:text-ink",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <NetworkSwitcher className="hidden sm:inline-flex" />
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}

export function SiteFooter() {
  const network = useNetwork();
  return (
    <footer className="mt-24 border-t-2 border-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-[0.88rem] leading-relaxed text-muted">
            Prediction markets opened by an autonomous agent and settled by the contract that holds
            the money. No oracle, no resolver key, no backend.
          </p>
        </div>
        <FooterColumn title="Product">
          <FooterLink to="/markets">Markets</FooterLink>
          <FooterLink to="/jury">Jury</FooterLink>
          <FooterLink to="/agent">The agent</FooterLink>
          <FooterLink to="/create">Open a market</FooterLink>
        </FooterColumn>
        <FooterColumn title="Understand">
          <FooterLink to="/docs/how-it-settles">How it settles</FooterLink>
          <FooterLink to="/docs/positions">Position tokens</FooterLink>
          <FooterLink to="/docs/limits">What it does not claim</FooterLink>
          <FooterLink href={NETWORKS[network].explorer}>Explorer</FooterLink>
        </FooterColumn>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5">
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
            Built on GenLayer · {NETWORKS[network].label}
          </span>
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
            Every figure here is a live contract read
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted">{title}</h4>
      <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ to, href, children }: { to?: string; href?: string; children: ReactNode }) {
  return (
    <li>
      {to ? (
        <Link to={to} className="text-[0.88rem] text-ink-soft transition-colors hover:text-oxblood">
          {children}
        </Link>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[0.88rem] text-ink-soft transition-colors hover:text-oxblood"
        >
          {children}
        </a>
      )}
    </li>
  );
}
