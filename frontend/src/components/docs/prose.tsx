import { useState, type ReactNode } from "react";

/** The typographic kit the docs pages are built from. Deliberately small: a
 *  handful of shapes used consistently reads better than a component per idea. */

export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-[1.08rem] leading-relaxed text-ink-soft">{children}</p>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-[0.98rem] leading-relaxed text-ink-soft">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-12 border-t border-line pt-6 font-display text-2xl text-ink">{children}</h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-8 font-display text-lg text-ink">{children}</h3>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-5 flex flex-col gap-2.5">{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 text-[0.98rem] leading-relaxed text-ink-soft">
      <span className="absolute left-0 top-[0.62em] h-1 w-1 rounded-full bg-line-strong" />
      {children}
    </li>
  );
}

export function Note({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-7 rounded-sm border-l-2 border-l-gold bg-gold/8 px-5 py-4">
      {title ? <div className="font-display text-base text-ink">{title}</div> : null}
      <div className="mt-1 text-[0.94rem] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

export function Warn({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-7 rounded-sm border-l-2 border-l-no bg-no/5 px-5 py-4">
      {title ? <div className="font-display text-base text-ink">{title}</div> : null}
      <div className="mt-1 text-[0.94rem] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[2px] bg-paper-2 px-1.5 py-0.5 font-mono text-[0.86em] text-ink">
      {children}
    </code>
  );
}

/** A copy button that reveals on hover and stays visible on touch, where there is
 *  no hover to reveal it. */
export function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setState("copied");
    } catch {
      // Clipboard access needs a secure context and can simply be refused.
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }

  return (
    <div className="group relative mt-6">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-sm border border-line bg-paper px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {state === "copied" ? "copied" : state === "failed" ? "copy failed" : "copy"}
      </button>
      <pre className="overflow-x-auto rounded-sm border border-line bg-surface p-4 text-[0.79rem] leading-relaxed">
        <code className={`font-mono text-ink/90 language-${lang ?? "text"}`}>{children}</code>
      </pre>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[0.9rem]">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="border-b border-ink pb-2 font-mono text-[0.66rem] uppercase tracking-[0.16em] text-muted"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-line py-3 pr-4 text-ink-soft last:pr-0">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
