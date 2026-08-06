import type { ReactNode } from "react";

export function PageHead({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </header>
  );
}

export function Kpi({
  label,
  value,
  unit,
  foot,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  foot?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className="kpi"
      style={accent ? ({ "--kpi-accent": accent } as React.CSSProperties) : undefined}
    >
      <div className="kpi-label">
        {icon && (
          <span
            className="kpi-icon"
            style={
              accent
                ? ({
                    color: accent,
                    background: "rgba(255,255,255,0.06)",
                  } as React.CSSProperties)
                : undefined
            }
          >
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
