/**
 * One source of truth for the docs. The sidebar, the search and the prev/next
 * footer all read this list, so a page can never be reachable from one and
 * missing from another.
 */
export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
}

export interface DocSection {
  title: string;
  pages: DocEntry[];
}

export const DOCS: DocSection[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "what-cassandra-is",
        title: "What Cassandra is",
        summary: "Prediction markets where the contract holding the money is also the thing that settles them.",
      },
      {
        slug: "how-it-settles",
        title: "How it settles",
        summary: "The consensus round, in detail: what is fetched, what is compared, and what is deliberately not.",
      },
      {
        slug: "the-agent",
        title: "The agent",
        summary: "What the predictor does, what it is allowed to do, and why it cannot influence a verdict.",
      },
    ],
  },
  {
    title: "Mechanics",
    pages: [
      {
        slug: "positions",
        title: "Position tokens",
        summary: "Stakes are tokens in their own contract. Why they are transferable, and when they stop being.",
      },
      {
        slug: "the-jury",
        title: "The jury",
        summary: "An application-level bond pool — emphatically not GenLayer's protocol staking.",
      },
      {
        slug: "disputes",
        title: "Disputes and appeals",
        summary: "Challenging a verdict, what a failed challenge costs, and what an appeal does at the protocol layer.",
      },
      {
        slug: "evidence",
        title: "Evidence sources",
        summary: "The five feeds, how a URL is derived, and why a source cannot be swapped after the fact.",
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        slug: "contracts",
        title: "Contract reference",
        summary: "Every method on both contracts, with what it costs and who may call it.",
      },
      {
        slug: "networks",
        title: "Networks",
        summary: "Where Cassandra is deployed, and the quotas worth knowing about before you test.",
      },
      {
        slug: "running-it",
        title: "Running it yourself",
        summary: "Tests, a local deploy, and driving the agent by hand.",
      },
      {
        slug: "limits",
        title: "What it does not claim",
        summary: "The three honest caveats. Read this one before you trust anything else here.",
      },
    ],
  },
];

export const DOC_ORDER: DocEntry[] = DOCS.flatMap((section) => section.pages);

export function docPath(slug: string) {
  return `/docs/${slug}`;
}

export function findDoc(slug: string | undefined): DocEntry | undefined {
  return DOC_ORDER.find((page) => page.slug === slug);
}

export function neighbours(slug: string | undefined) {
  const index = DOC_ORDER.findIndex((page) => page.slug === slug);
  return {
    previous: index > 0 ? DOC_ORDER[index - 1] : undefined,
    next: index >= 0 && index < DOC_ORDER.length - 1 ? DOC_ORDER[index + 1] : undefined,
  };
}
