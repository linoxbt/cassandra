import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DOCS, DOC_ORDER, docPath } from "@/lib/docs-nav";
import { cn, Label } from "@/components/ui";

/** The docs shell: one sidebar, one search, one content column. Both the sidebar
 *  and the search read `DOCS`, so they cannot drift apart. */
export function DocsLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-[92px] lg:h-fit">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mb-4 flex w-full items-center justify-between rounded-sm border border-line px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted lg:hidden"
          >
            Contents
            <span aria-hidden>{open ? "–" : "+"}</span>
          </button>
          <div className={cn(open ? "block" : "hidden", "lg:block")}>
            <DocsSearch />
            <nav className="mt-6 flex flex-col gap-7">
              {DOCS.map((section) => (
                <div key={section.title}>
                  <Label>{section.title}</Label>
                  <ul className="mt-2.5 flex flex-col gap-0.5">
                    {section.pages.map((page) => (
                      <li key={page.slug}>
                        <NavLink
                          to={docPath(page.slug)}
                          className={({ isActive }) =>
                            cn(
                              "block rounded-sm px-2.5 py-1.5 text-[0.88rem] transition-colors",
                              isActive
                                ? "bg-gold/12 font-medium text-oxblood"
                                : "text-ink-soft hover:bg-paper-2 hover:text-ink",
                            )
                          }
                        >
                          {page.title}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
        <main className="min-w-0 max-w-3xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function DocsSearch() {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return DOC_ORDER.filter(
      (page) =>
        page.title.toLowerCase().includes(needle) || page.summary.toLowerCase().includes(needle),
    ).slice(0, 6);
  }, [query]);

  return (
    <div className="relative">
      <input
        ref={input}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search docs"
        aria-label="Search the documentation"
        className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-[0.86rem] text-ink outline-none placeholder:text-muted focus:border-line-strong"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted">
        ⌘K
      </kbd>
      {results.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-sm border border-line bg-surface shadow-sm">
          {results.map((page) => (
            <li key={page.slug}>
              <Link
                to={docPath(page.slug)}
                onClick={() => setQuery("")}
                className="block px-3 py-2 text-[0.85rem] text-ink-soft hover:bg-paper-2 hover:text-ink"
              >
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
