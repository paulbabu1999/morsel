import type { CaptureSource, QueryRoute } from "../api";
import {
  IconAggregate,
  IconGlasses,
  IconHybrid,
  IconPencil,
  IconPhone,
  IconSemantic,
} from "./icons";

/* ---------- Source badge ---------- */
const SOURCE_META: Record<
  CaptureSource,
  { label: string; Icon: typeof IconPhone }
> = {
  glasses: { label: "Glasses", Icon: IconGlasses },
  phone: { label: "Phone", Icon: IconPhone },
  manual: { label: "Manual", Icon: IconPencil },
};

export function SourceBadge({ source }: { source: CaptureSource }) {
  const { label, Icon } = SOURCE_META[source] ?? SOURCE_META.manual;
  return (
    <span className={`badge badge-${source}`}>
      <Icon width={13} height={13} />
      {label}
    </span>
  );
}

/* ---------- Route badge (the centerpiece) ---------- */
export const ROUTE_META: Record<
  QueryRoute,
  { label: string; Icon: typeof IconAggregate; blurb: string; engine: string }
> = {
  aggregate: {
    label: "Aggregate",
    Icon: IconAggregate,
    blurb: "Counting & summing structured rows",
    engine: "text-to-SQL over normalized tables",
  },
  semantic: {
    label: "Semantic",
    Icon: IconSemantic,
    blurb: "Finding meals by meaning",
    engine: "pgvector similarity + BM25",
  },
  hybrid: {
    label: "Hybrid",
    Icon: IconHybrid,
    blurb: "Filtering by meaning, then aggregating",
    engine: "vector retrieval + SQL aggregation",
  },
};

export function RouteBadge({
  route,
  size = "md",
}: {
  route: QueryRoute;
  size?: "md" | "lg";
}) {
  const meta = ROUTE_META[route];
  const Icon = meta.Icon;
  return (
    <span className={`route-badge route-${route}${size === "lg" ? " lg" : ""}`}>
      <Icon className="rb-glyph" />
      {meta.label}
    </span>
  );
}
