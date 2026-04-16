import { useMemo, useState } from "react";
import { clamp, labToSrgb, parseLabInput } from "../lib/color";

type LabInputText = {
  L: string;
  a: string;
  b: string;
};

type ColorEditorProps = {
  title: string;
  value: LabInputText;
  onChange: (next: LabInputText) => void;
};

function ColorEditor({ title, value, onChange }: ColorEditorProps) {
  return (
    <div className="compare-input-card">
      <h3>{title}</h3>

      <div className="compare-field-grid">
        <label className="compare-field">
          <span>L*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.L}
            onChange={(e) =>
              onChange({
                ...value,
                L: e.target.value,
              })
            }
          />
        </label>

        <label className="compare-field">
          <span>a*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.a}
            onChange={(e) =>
              onChange({
                ...value,
                a: e.target.value,
              })
            }
          />
        </label>

        <label className="compare-field">
          <span>b*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.b}
            onChange={(e) =>
              onChange({
                ...value,
                b: e.target.value,
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

function getPreviewValue(value: string, fallback: number) {
  const parsed = parseLabInput(value);
  return parsed ?? fallback;
}

export default function ColorCompareSection() {
  const [color1, setColor1] = useState<LabInputText>({ L: "70", a: "12", b: "18" });
  const [color2, setColor2] = useState<LabInputText>({ L: "70", a: "4", b: "8" });
  const [color3, setColor3] = useState<LabInputText>({ L: "70", a: "-6", b: "-8" });

  const previews = useMemo(() => {
    const items = [
      { label: "색상 1", value: color1, fallback: { L: 70, a: 12, b: 18 } },
      { label: "색상 2", value: color2, fallback: { L: 70, a: 4, b: 8 } },
      { label: "색상 3", value: color3, fallback: { L: 70, a: -6, b: -8 } },
    ];

    return items.map((item) => {
      const L = getPreviewValue(item.value.L, item.fallback.L);
      const a = getPreviewValue(item.value.a, item.fallback.a);
      const b = getPreviewValue(item.value.b, item.fallback.b);

      const converted = labToSrgb(L, a, b);

      return {
        label: item.label,
        lab: { L, a, b },
        hex: converted.hex,
        rgb255: converted.rgb255,
        inGamut: converted.inGamut,
        cssColor: `rgb(${clamp(converted.rgb255.r, 0, 255)}, ${clamp(converted.rgb255.g, 0, 255)}, ${clamp(converted.rgb255.b, 0, 255)})`,
      };
    });
  }, [color1, color2, color3]);

  return (
    <section id="color-compare" className="section compare-section">
      <div className="section-header">
        <p className="eyebrow">Color Compare</p>
        <h2>Lab 색상 비교 툴</h2>
        <p className="section-description">
          Lab 값을 직접 입력해 3가지 색상을 가로로 나란히 놓고 육안으로 비교할 수 있습니다.
        </p>
      </div>

      <div className="compare-stage">
        {previews.map((item) => (
          <div key={item.label} className="compare-stage-card">
            <div
              className="compare-swatch"
              style={{ backgroundColor: item.cssColor }}
              aria-label={`${item.label} 색상 미리보기`}
            />
            <div className="compare-stage-meta">
              <strong>{item.label}</strong>
              <span>{item.hex}</span>
              <span>
                RGB ({item.rgb255.r}, {item.rgb255.g}, {item.rgb255.b})
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="compare-input-grid">
        <ColorEditor title="색상 1" value={color1} onChange={setColor1} />
        <ColorEditor title="색상 2" value={color2} onChange={setColor2} />
        <ColorEditor title="색상 3" value={color3} onChange={setColor3} />
      </div>

      <div className="compare-summary-grid">
        {previews.map((item) => (
          <div key={`${item.label}-summary`} className="compare-summary-card">
            <strong>{item.label}</strong>
            <span>
              Lab ({item.lab.L.toFixed(1)}, {item.lab.a.toFixed(1)}, {item.lab.b.toFixed(1)})
            </span>
            <span>{item.inGamut ? "sRGB 범위 내" : "일부 색역 클리핑"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}