export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-header">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="section-title">{title}</h2>
      <p className="section-description">{description}</p>
    </div>
  );
}

export function InfoChip({ text, secondary = false }: { text: string; secondary?: boolean }) {
  return <span className={`chip ${secondary ? "chip-secondary" : ""}`}>{text}</span>;
}

export function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      {subtitle ? <div className="stat-subtitle">{subtitle}</div> : null}
    </div>
  );
}

export function ColorInfoCard({
  title,
  swatch,
  lines,
  empty = false,
}: {
  title: string;
  swatch: string;
  lines: string[];
  empty?: boolean;
}) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <div className="swatch-large" style={{ background: swatch }} />
      <div className={`color-lines ${empty ? "color-lines-empty" : ""}`}>
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}