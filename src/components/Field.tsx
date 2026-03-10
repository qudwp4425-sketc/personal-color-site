type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  min: number;
  max: number;
};

export default function Field({ label, value, onChange, onCommit, min, max }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit?.();
          }
        }}
      />
      <span className="field-hint">
        range: {min} to {max}
      </span>
    </label>
  );
}