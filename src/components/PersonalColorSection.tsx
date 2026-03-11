import { useMemo, useRef, useState } from "react";
import { InfoChip, SectionHeader } from "./Cards";
import { labToLch, round, srgb255ToLab, rgb255ToHex } from "../lib/color";

type AnalysisResult = {
  avgLab: { L: number; a: number; b: number };
  lch: { L: number; C: number; h: number };
  tone: "Warm" | "Cool" | "Neutral";
  confidence: "High" | "Medium" | "Low";
  sampleCount: number;
  avgRgb: { r: number; g: number; b: number };
  hex: string;
  quality: {
    brightnessOk: boolean;
    symmetryOk: boolean;
    resolutionOk: boolean;
  };
};

type AppliedPortrait = {
  src: string;
  cutoutSrc: string;
  analysis: AnalysisResult;
};

type PersonalColorSectionProps = {
  onApplyToSimulator: (payload: AppliedPortrait) => void;
};

function isSkinLike(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const rgbRule =
    r > 60 &&
    g > 40 &&
    b > 20 &&
    r > g &&
    r > b &&
    max - min > 10 &&
    Math.abs(r - g) > 5;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;

  const ycbcrRule = y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

  return rgbRule && ycbcrRule;
}

function scoreToneFromLab(L: number, a: number, b: number) {
  const lch = labToLch(L, a, b);

  if (b >= 16 && lch.h >= 40 && lch.h <= 95) return "Warm" as const;
  if (b <= 13 && (lch.h < 40 || lch.h > 95)) return "Cool" as const;
  if (b - a >= 8) return "Warm" as const;
  if (a >= b) return "Cool" as const;
  return "Neutral" as const;
}

function getConfidence(sampleCount: number, brightnessOk: boolean, symmetryOk: boolean, resolutionOk: boolean) {
  let score = 0;
  if (sampleCount > 2500) score += 1;
  if (brightnessOk) score += 1;
  if (symmetryOk) score += 1;
  if (resolutionOk) score += 1;

  if (score >= 4) return "High" as const;
  if (score >= 2) return "Medium" as const;
  return "Low" as const;
}

export default function PersonalColorSection({ onApplyToSimulator }: PersonalColorSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cutoutCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [uploadedImage, setUploadedImage] = useState<null | {
    src: string;
    name: string;
    width: number;
    height: number;
  }>(null);

  const [cutoutSrc, setCutoutSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const resultLines = useMemo(() => {
    if (!analysis) return [];
    return [
      `Lab (${round(analysis.avgLab.L)}, ${round(analysis.avgLab.a)}, ${round(analysis.avgLab.b)})`,
      `h° ${round(analysis.lch.h)} · C*ab ${round(analysis.lch.C)}`,
      `RGB ${analysis.avgRgb.r}, ${analysis.avgRgb.g}, ${analysis.avgRgb.b}`,
      `HEX ${analysis.hex}`,
      `Tone ${analysis.tone} · Confidence ${analysis.confidence}`,
    ];
  }, [analysis]);

  const loadImageFile = (file: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return;

      const img = new Image();
      img.onload = () => {
        const sourceCanvas = sourceCanvasRef.current;
        const cutoutCanvas = cutoutCanvasRef.current;
        if (!sourceCanvas || !cutoutCanvas) return;

        sourceCanvas.width = img.naturalWidth;
        sourceCanvas.height = img.naturalHeight;

        cutoutCanvas.width = img.naturalWidth;
        cutoutCanvas.height = img.naturalHeight;

        const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const cctx = cutoutCanvas.getContext("2d", { willReadFrequently: true });
        if (!sctx || !cctx) return;

        sctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        cctx.clearRect(0, 0, cutoutCanvas.width, cutoutCanvas.height);

        sctx.drawImage(img, 0, 0);
        cctx.drawImage(img, 0, 0);

        const imageData = sctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const cutoutData = cctx.getImageData(0, 0, cutoutCanvas.width, cutoutCanvas.height);
        const data = imageData.data;
        const out = cutoutData.data;

        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const cx = w * 0.5;
        const cy = h * 0.48;
        const rx = w * 0.2;
        const ry = h * 0.28;

        let sumL = 0;
        let sumA = 0;
        let sumB = 0;
        let sumR = 0;
        let sumG = 0;
        let sumBl = 0;
        let sampleCount = 0;

        let leftL = 0;
        let rightL = 0;
        let leftCount = 0;
        let rightCount = 0;

        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const nx = (x - cx) / rx;
            const ny = (y - cy) / ry;
            const inFaceEllipse = nx * nx + ny * ny <= 1;

            if (!inFaceEllipse) {
              out[idx + 3] = 0;
              continue;
            }

            const lab = srgb255ToLab(r, g, b);
            const keep = isSkinLike(r, g, b);

            if (!keep) {
              out[idx + 3] = 0;
              continue;
            }

            sumL += lab.L;
            sumA += lab.a;
            sumB += lab.b;
            sumR += r;
            sumG += g;
            sumBl += b;
            sampleCount += 1;

            if (x < cx) {
              leftL += lab.L;
              leftCount += 1;
            } else {
              rightL += lab.L;
              rightCount += 1;
            }
          }
        }

        cctx.putImageData(cutoutData, 0, 0);

        const cutoutUrl = cutoutCanvas.toDataURL("image/png");
        setCutoutSrc(cutoutUrl);

        const brightnessMean = sampleCount > 0 ? sumL / sampleCount : 0;
        const leftMean = leftCount > 0 ? leftL / leftCount : 0;
        const rightMean = rightCount > 0 ? rightL / rightCount : 0;
        const symmetryDelta = Math.abs(leftMean - rightMean);

        const brightnessOk = brightnessMean >= 45 && brightnessMean <= 82;
        const symmetryOk = symmetryDelta <= 8;
        const resolutionOk = img.naturalWidth >= 480 && img.naturalHeight >= 480;

        if (sampleCount < 300) {
          setUploadedImage({
            src,
            name: file.name,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
          setAnalysis(null);
          return;
        }

        const avgLab = {
          L: sumL / sampleCount,
          a: sumA / sampleCount,
          b: sumB / sampleCount,
        };

        const lch = labToLch(avgLab.L, avgLab.a, avgLab.b);
        const avgRgb = {
          r: Math.round(sumR / sampleCount),
          g: Math.round(sumG / sampleCount),
          b: Math.round(sumBl / sampleCount),
        };

        const tone = scoreToneFromLab(avgLab.L, avgLab.a, avgLab.b);
        const confidence = getConfidence(sampleCount, brightnessOk, symmetryOk, resolutionOk);

        const nextAnalysis: AnalysisResult = {
          avgLab,
          lch,
          tone,
          confidence,
          sampleCount,
          avgRgb,
          hex: rgb255ToHex(avgRgb),
          quality: {
            brightnessOk,
            symmetryOk,
            resolutionOk,
          },
        };

        setUploadedImage({
          src,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setAnalysis(nextAnalysis);
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  };

  return (
    <section id="personal-color" className="section">
      <SectionHeader
        eyebrow="Personal Color"
        title="Face Lab Analyzer"
        description="얼굴 사진의 중앙 피부 영역을 기준으로 Lab, hue angle, chroma를 계산하고 웜/쿨 경향을 추정합니다. 현재 버전은 프론트엔드 기반 근사 분석이며, 촬영 조건에 따라 결과가 달라질 수 있습니다."
      />

      <div
        className="simulator-grid"
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          alignItems: "start",
        }}
      >
        <div className="card">
          <h3 className="card-title">촬영 가이드</h3>

          <div className="guide-grid">
            <div className="guide-item">정면 사진, 눈높이 촬영</div>
            <div className="guide-item">노란 조명 + 자연광 혼합 금지</div>
            <div className="guide-item">필터, 뷰티모드, 보정앱 사용 금지</div>
            <div className="guide-item">안경, 마스크, 모자, 앞머리 가림 최소화</div>
            <div className="guide-item">흰색/회색 단색 배경 권장</div>
            <div className="guide-item">얼굴이 화면 중앙에 크게 보이도록 촬영</div>
          </div>

          <div className="note-box note-blue" style={{ marginTop: 16 }}>
            현재 버전은 얼굴 랜드마크 모델 없이 중앙 타원형 얼굴 ROI와 피부색 휴리스틱으로 분석합니다.
            정확한 퍼스널컬러 진단이 아니라 피부색 경향 추정용입니다.
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              loadImageFile(file);
              e.target.value = "";
            }}
          />

          <div className="button-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              얼굴 사진 업로드
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">분석 결과</h3>

          {uploadedImage ? (
            <>
              <div className="chip-row" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <InfoChip text={uploadedImage.name} />
                <InfoChip text={`${uploadedImage.width} × ${uploadedImage.height}`} secondary />
                {analysis ? <InfoChip text={`${analysis.sampleCount} sampled pixels`} secondary /> : null}
              </div>

              <div className="portrait-compare-grid">
                <div>
                  <div className="mini-label">원본</div>
                  <div className="portrait-frame">
                    <img src={uploadedImage.src} alt="Uploaded portrait" className="portrait-image" />
                  </div>
                </div>

                <div>
                  <div className="mini-label">얼굴 누끼</div>
                  <div className="portrait-frame portrait-cutout-stage">
                    {cutoutSrc ? <img src={cutoutSrc} alt="Face cutout" className="portrait-image" /> : null}
                  </div>
                </div>
              </div>

              {analysis ? (
                <>
                  <div className="analysis-grid">
                    <div className="metric-card">
                      <div className="metric-label">L*</div>
                      <div className="metric-value">{round(analysis.avgLab.L)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">a*</div>
                      <div className="metric-value">{round(analysis.avgLab.a)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">b*</div>
                      <div className="metric-value">{round(analysis.avgLab.b)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">h°</div>
                      <div className="metric-value">{round(analysis.lch.h)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">C*ab</div>
                      <div className="metric-value">{round(analysis.lch.C)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Tone</div>
                      <div className="metric-value">{analysis.tone}</div>
                    </div>
                  </div>

                  <div className="result-summary-card">
                    <div className="swatch-inline" style={{ background: analysis.hex }} />
                    <div className="result-summary-text">
                      {resultLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </div>

                  <div className="quality-grid">
                    <div className={`quality-item ${analysis.quality.brightnessOk ? "quality-ok" : "quality-bad"}`}>
                      노출 적정: {analysis.quality.brightnessOk ? "통과" : "재촬영 권장"}
                    </div>
                    <div className={`quality-item ${analysis.quality.symmetryOk ? "quality-ok" : "quality-bad"}`}>
                      좌우 조명 균형: {analysis.quality.symmetryOk ? "양호" : "불균형"}
                    </div>
                    <div className={`quality-item ${analysis.quality.resolutionOk ? "quality-ok" : "quality-bad"}`}>
                      해상도: {analysis.quality.resolutionOk ? "양호" : "낮음"}
                    </div>
                  </div>

                  <div className="button-row" style={{ marginTop: 16 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (!uploadedImage || !cutoutSrc || !analysis) return;
                        onApplyToSimulator({
                          src: uploadedImage.src,
                          cutoutSrc,
                          analysis,
                        });
                        window.location.hash = "simulator";
                      }}
                    >
                      색 적용
                    </button>
                  </div>
                </>
              ) : (
                <div className="note-box note-amber" style={{ marginTop: 16 }}>
                  피부 샘플 수가 충분하지 않습니다. 얼굴이 더 크게 나오고 조명이 균일한 사진으로 다시 업로드하는 편이 좋습니다.
                </div>
              )}
            </>
          ) : (
            <div className="empty-box">
              아직 업로드된 얼굴 사진이 없습니다. 정면 얼굴 사진을 올리면 피부색 근사 분석과 얼굴 누끼를 생성합니다.
            </div>
          )}
        </div>
      </div>

      <canvas ref={sourceCanvasRef} style={{ display: "none" }} />
      <canvas ref={cutoutCanvasRef} style={{ display: "none" }} />
    </section>
  );
}