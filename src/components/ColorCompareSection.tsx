import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, labToSrgb, parseLabInput } from "../lib/color";

type LabInputText = {
  L: string;
  a: string;
  b: string;
};

type ChannelKey = keyof LabInputText;

type ChannelConfig = {
  key: ChannelKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

type ColorEditorProps = {
  title: string;
  value: LabInputText;
  onChange: (next: LabInputText) => void;
  fallback: { L: number; a: number; b: number };
};

const CHANNELS: ChannelConfig[] = [
  { key: "L", label: "L*", min: 0, max: 100, step: 0.1 },
  { key: "a", label: "a*", min: -128, max: 127, step: 0.1 },
  { key: "b", label: "b*", min: -128, max: 127, step: 0.1 },
];

function getPreviewValue(value: string, fallback: number) {
  const parsed = parseLabInput(value);
  return parsed ?? fallback;
}

function getSliderValue(value: string, fallback: number, min: number, max: number) {
  const parsed = parseLabInput(value);
  const numeric = parsed ?? fallback;
  return clamp(numeric, min, max);
}

function formatSliderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ColorEditor({ title, value, onChange, fallback }: ColorEditorProps) {
  return (
    <div className="compare-input-card">
      <h3>{title}</h3>

      <div className="compare-field-grid">
        {CHANNELS.map((channel) => {
          const fallbackValue = fallback[channel.key];
          const sliderValue = getSliderValue(
            value[channel.key],
            fallbackValue,
            channel.min,
            channel.max,
          );

          return (
            <label key={channel.key} className="compare-field">
              <span>{channel.label}</span>

              <div className="compare-control-row">
                <input
                  type="text"
                  inputMode="decimal"
                  value={value[channel.key]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [channel.key]: e.target.value,
                    })
                  }
                />

                <input
                  className="compare-slider"
                  type="range"
                  min={channel.min}
                  max={channel.max}
                  step={channel.step}
                  value={sliderValue}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [channel.key]: formatSliderValue(Number(e.target.value)),
                    })
                  }
                />
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

async function copyColorAsImage(cssColor: string) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context를 만들 수 없습니다.");
  }

  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png");
  });

  if (!blob) {
    throw new Error("이미지 생성에 실패했습니다.");
  }

  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("이 브라우저는 이미지 클립보드 복사를 지원하지 않습니다.");
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ]);
}

export default function ColorCompareSection() {
  const fallback1 = { L: 70, a: 12, b: 18 };
  const fallback2 = { L: 70, a: 4, b: 8 };
  const fallback3 = { L: 70, a: -6, b: -8 };

  const [color1, setColor1] = useState<LabInputText>({ L: "70", a: "12", b: "18" });
  const [color2, setColor2] = useState<LabInputText>({ L: "70", a: "4", b: "8" });
  const [color3, setColor3] = useState<LabInputText>({ L: "70", a: "-6", b: "-8" });

  const [copyMessage, setCopyMessage] = useState("");
  const pressTimerRef = useRef<number | null>(null);
  const copyingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  const previews = useMemo(() => {
    const items = [
      { label: "색상 1", value: color1, fallback: fallback1 },
      { label: "색상 2", value: color2, fallback: fallback2 },
      { label: "색상 3", value: color3, fallback: fallback3 },
    ];

    return items.map((item) => {
      const L = getPreviewValue(item.value.L, item.fallback.L);
      const a = getPreviewValue(item.value.a, item.fallback.a);
      const b = getPreviewValue(item.value.b, item.fallback.b);

      const converted = labToSrgb(L, a, b);

      return {
        label: item.label,
        lab: { L, a, b },
        cssColor: `rgb(${clamp(converted.rgb255.r, 0, 255)}, ${clamp(
          converted.rgb255.g,
          0,
          255,
        )}, ${clamp(converted.rgb255.b, 0, 255)})`,
      };
    });
  }, [color1, color2, color3]);

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const runCopy = async (label: string, cssColor: string) => {
    if (copyingRef.current) return;
    copyingRef.current = true;

    try {
      await copyColorAsImage(cssColor);
      setCopyMessage(`${label} 이미지가 클립보드에 복사되었습니다.`);
    } catch (error) {
      setCopyMessage(
        error instanceof Error
          ? `${label} 복사 실패: ${error.message}`
          : `${label} 복사에 실패했습니다.`,
      );
    } finally {
      copyingRef.current = false;
    }
  };

  const startPressCopy = (label: string, cssColor: string) => {
    clearPressTimer();

    pressTimerRef.current = window.setTimeout(() => {
      void runCopy(label, cssColor);
    }, 500);
  };

  const endPressCopy = () => {
    clearPressTimer();
  };

  return (
    <section id="color-compare" className="section compare-section">
      <div className="section-header">
        <p className="eyebrow">Color Compare</p>
        <h2>Lab 색상 비교 툴</h2>
        <p className="section-description">
          Lab 값을 직접 입력하거나 슬라이더로 조정해 3가지 색상을 가로로 나란히 놓고 육안으로
          비교할 수 있습니다.
        </p>
      </div>

      {copyMessage ? <div className="compare-copy-message">{copyMessage}</div> : null}

      <div className="compare-stage">
        {previews.map((item) => (
          <div key={item.label} className="compare-stage-card">
            <div className="compare-swatch-shell">
              <button
                type="button"
                className="compare-copy-button"
                onClick={() => void runCopy(item.label, item.cssColor)}
                aria-label={`${item.label} 이미지 복사`}
                title="색상 이미지 복사"
              >
                복사
              </button>

              <div
                className="compare-swatch compare-swatch-copyable"
                style={{ backgroundColor: item.cssColor }}
                aria-label={`${item.label} 색상 미리보기`}
                title="길게 누르거나 복사 버튼을 누르세요"
                onPointerDown={() => startPressCopy(item.label, item.cssColor)}
                onPointerUp={endPressCopy}
                onPointerLeave={endPressCopy}
                onPointerCancel={endPressCopy}
              />
            </div>

            <div className="compare-stage-meta">
              <strong>{item.label}</strong>
              <span>
                Lab ({item.lab.L.toFixed(1)}, {item.lab.a.toFixed(1)}, {item.lab.b.toFixed(1)})
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="compare-input-grid">
        <ColorEditor
          title="색상 1"
          value={color1}
          onChange={setColor1}
          fallback={fallback1}
        />
        <ColorEditor
          title="색상 2"
          value={color2}
          onChange={setColor2}
          fallback={fallback2}
        />
        <ColorEditor
          title="색상 3"
          value={color3}
          onChange={setColor3}
          fallback={fallback3}
        />
      </div>
    </section>
  );
}