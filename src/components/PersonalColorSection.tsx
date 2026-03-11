import { useMemo, useRef, useState } from "react";
import { InfoChip, SectionHeader } from "./Cards";
import { labToLch, round, srgb255ToLab, rgb255ToHex } from "../lib/color";

type RegionName = "leftCheek" | "rightCheek" | "chin";

type RegionAnalysis = {
  name: RegionName;
  label: string;
  avgLab: { L: number; a: number; b: number };
  lch: { L: number; C: number; h: number };
  avgRgb: { r: number; g: number; b: number };
  hex: string;
  sampleCount: number;
  warmScore: number;
  coolScore: number;
  tone: "Warm" | "Cool" | "Neutral";
};

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
    regionAgreementOk: boolean;
  };
  regions: RegionAnalysis[];
  scoreSummary: {
    warm: number;
    cool: number;
    gap: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

function hueDistance(h1: number, h2: number) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

function getRegionToneScore(lab: { L: number; a: number; b: number }) {
  const lch = labToLch(lab.L, lab.a, lab.b);

  let warm = 0;
  let cool = 0;

  // yellow bias
  if (lab.b >= 18) warm += 2.4;
  else if (lab.b >= 15) warm += 1.8;
  else if (lab.b >= 12) warm += 1.0;
  else cool += 0.8;

  // b* vs a* balance
  if (lab.b - lab.a >= 10) warm += 2.0;
  else if (lab.b - lab.a >= 6) warm += 1.2;
  else if (lab.a - lab.b >= 2) cool += 1.6;
  else if (lab.a >= lab.b) cool += 1.0;

  // hue warm zone: yellow-red skin zone
  if (lch.h >= 38 && lch.h <= 82) warm += 2.0;
  else if (lch.h >= 82 && lch.h <= 95) warm += 1.0;
  else if (lch.h < 30 || lch.h > 95) cool += 1.6;

  // very low yellow support
  if (lab.b <= 10) cool += 1.8;
  else if (lab.b <= 13) cool += 1.0;

  // chroma too low = weak evidence
  if (lch.C < 12) {
    warm *= 0.8;
    cool *= 0.8;
  }

  const gap = warm - cool;

  let tone: "Warm" | "Cool" | "Neutral" = "Neutral";
  if (gap >= 1.2) tone = "Warm";
  else if (gap <= -1.2) tone = "Cool";

  return { warm, cool, tone, lch };
}

function getConfidence(params: {
  sampleCount: number;
  brightnessOk: boolean;
  symmetryOk: boolean;
  resolutionOk: boolean;
  regionAgreementOk: boolean;
}) {
  let score = 0;
  if (params.sampleCount > 1800) score += 1;
  if (params.brightnessOk) score += 1;
  if (params.symmetryOk) score += 1;
  if (params.resolutionOk) score += 1;
  if (params.regionAgreementOk) score += 1;

  if (score >= 5) return "High" as const;
  if (score >= 3) return "Medium" as const;
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
      `Warm Score ${round(analysis.scoreSummary.warm)} · Cool Score ${round(analysis.scoreSummary.cool)}`,
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

        // 표시용 마스크
        const displayCx = w * 0.5;
        const displayCy = h * 0.47;
        const displayRx = w * 0.26;
        const displayRy = h * 0.40;

        const regions = [
          {
            key: "leftCheek" as const,
            label: "좌볼",
            cx: w * 0.39,
            cy: h * 0.50,
            rx: w * 0.08,
            ry: h * 0.10,
          },
          {
            key: "rightCheek" as const,
            label: "우볼",
            cx: w * 0.61,
            cy: h * 0.50,
            rx: w * 0.08,
            ry: h * 0.10,
          },
          {
            key: "chin" as const,
            label: "턱",
            cx: w * 0.50,
            cy: h * 0.68,
            rx: w * 0.09,
            ry: h * 0.08,
          },
        ];

        const accum = regions.map((region) => ({
          ...region,
          sumL: 0,
          sumA: 0,
          sumB: 0,
          sumR: 0,
          sumG: 0,
          sumBl: 0,
          count: 0,
        }));

        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // 표시용 누끼
            const dnx = (x - displayCx) / displayRx;
            const dny = (y - displayCy) / displayRy;
            const displayDist = dnx * dnx + dny * dny;

            if (displayDist > 1.08) {
              out[idx + 3] = 0;
            } else {
              const alphaFactor = displayDist <= 0.9 ? 1 : clamp((1.08 - displayDist) / (1.08 - 0.9), 0, 1);
              out[idx + 3] = Math.round(255 * alphaFactor);
            }

            if (!isSkinLike(r, g, b)) continue;

            const lab = srgb255ToLab(r, g, b);

            for (const region of accum) {
              const nx = (x - region.cx) / region.rx;
              const ny = (y - region.cy) / region.ry;
              const inside = nx * nx + ny * ny <= 1;

              if (!inside) continue;

              region.sumL += lab.L;
              region.sumA += lab.a;
              region.sumB += lab.b;
              region.sumR += r;
              region.sumG += g;
              region.sumBl += b;
              region.count += 1;
            }
          }
        }

        cctx.putImageData(cutoutData, 0, 0);
        const cutoutUrl = cutoutCanvas.toDataURL("image/png");
        setCutoutSrc(cutoutUrl);

        const validRegions = accum.filter((region) => region.count >= 120);

        setUploadedImage({
          src,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });

        if (validRegions.length < 2) {
          setAnalysis(null);
          return;
        }

        const regionAnalyses: RegionAnalysis[] = validRegions.map((region) => {
          const avgLab = {
            L: region.sumL / region.count,
            a: region.sumA / region.count,
            b: region.sumB / region.count,
          };
          const toneScore = getRegionToneScore(avgLab);

          const avgRgb = {
            r: Math.round(region.sumR / region.count),
            g: Math.round(region.sumG / region.count),
            b: Math.round(region.sumBl / region.count),
          };

          return {
            name: region.key,
            label: region.label,
            avgLab,
            lch: toneScore.lch,
            avgRgb,
            hex: rgb255ToHex(avgRgb),
            sampleCount: region.count,
            warmScore: toneScore.warm,
            coolScore: toneScore.cool,
            tone: toneScore.tone,
          };
        });

        const totalWeight = regionAnalyses.reduce((acc, region) => acc + region.sampleCount, 0);

        const avgLab = {
          L:
            regionAnalyses.reduce((acc, region) => acc + region.avgLab.L * region.sampleCount, 0) /
            totalWeight,
          a:
            regionAnalyses.reduce((acc, region) => acc + region.avgLab.a * region.sampleCount, 0) /
            totalWeight,
          b:
            regionAnalyses.reduce((acc, region) => acc + region.avgLab.b * region.sampleCount, 0) /
            totalWeight,
        };

        const avgRgb = {
          r:
            Math.round(
              regionAnalyses.reduce((acc, region) => acc + region.avgRgb.r * region.sampleCount, 0) / totalWeight
            ),
          g:
            Math.round(
              regionAnalyses.reduce((acc, region) => acc + region.avgRgb.g * region.sampleCount, 0) / totalWeight
            ),
          b:
            Math.round(
              regionAnalyses.reduce((acc, region) => acc + region.avgRgb.b * region.sampleCount, 0) / totalWeight
            ),
        };

        const lch = labToLch(avgLab.L, avgLab.a, avgLab.b);

        const totalWarm = regionAnalyses.reduce((acc, region) => acc + region.warmScore, 0);
        const totalCool = regionAnalyses.reduce((acc, region) => acc + region.coolScore, 0);
        const scoreGap = totalWarm - totalCool;

        const regionHueSpread =
          regionAnalyses.length >= 2
            ? Math.max(...regionAnalyses.map((r) => r.lch.h)) - Math.min(...regionAnalyses.map((r) => r.lch.h))
            : 0;

        const regionBSpread =
          regionAnalyses.length >= 2
            ? Math.max(...regionAnalyses.map((r) => r.avgLab.b)) - Math.min(...regionAnalyses.map((r) => r.avgLab.b))
            : 0;

        const leftRegion = regionAnalyses.find((r) => r.name === "leftCheek");
        const rightRegion = regionAnalyses.find((r) => r.name === "rightCheek");

        const symmetryDelta =
          leftRegion && rightRegion ? Math.abs(leftRegion.avgLab.L - rightRegion.avgLab.L) : 99;

        const brightnessOk = avgLab.L >= 45 && avgLab.L <= 82;
        const symmetryOk = symmetryDelta <= 8;
        const resolutionOk = img.naturalWidth >= 480 && img.naturalHeight >= 480;
        const regionAgreementOk = regionHueSpread <= 26 && regionBSpread <= 8;

        let tone: "Warm" | "Cool" | "Neutral" = "Neutral";

        const warmRegionCount = regionAnalyses.filter((r) => r.tone === "Warm").length;
        const coolRegionCount = regionAnalyses.filter((r) => r.tone === "Cool").length;

        if (scoreGap >= 2.2 && warmRegionCount >= 2 && regionAgreementOk) {
          tone = "Warm";
        } else if (scoreGap <= -2.2 && coolRegionCount >= 2 && regionAgreementOk) {
          tone = "Cool";
        } else {
          tone = "Neutral";
        }

        const confidence = getConfidence({
          sampleCount: totalWeight,
          brightnessOk,
          symmetryOk,
          resolutionOk,
          regionAgreementOk,
        });

        const nextAnalysis: AnalysisResult = {
          avgLab,
          lch,
          tone,
          confidence,
          sampleCount: totalWeight,
          avgRgb,
          hex: rgb255ToHex(avgRgb),
          quality: {
            brightnessOk,
            symmetryOk,
            resolutionOk,
            regionAgreementOk,
          },
          regions: regionAnalyses,
          scoreSummary: {
            warm: totalWarm,
            cool: totalCool,
            gap: Math.abs(scoreGap),
          },
        };

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
        description="좌볼, 우볼, 턱의 피부 영역을 따로 분석한 뒤 Lab, hue angle, chroma, 부위 간 일관성을 함께 반영해 웜/쿨 성향을 추정합니다. 조명과 촬영 환경에 따라 결과는 달라질 수 있습니다."
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
            분석은 좌볼, 우볼, 턱의 피부 ROI를 각각 따로 계산합니다. 세 부위 결과가 서로 다르면 웜/쿨을 강하게 단정하지 않고 Neutral 쪽으로 보수적으로 처리합니다.
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
                      <div className="metric-label">Tone</div>
                      <div className="metric-value">{analysis.tone}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Confidence</div>
                      <div className="metric-value">{analysis.confidence}</div>
                    </div>
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
                  </div>

                  <div className="result-summary-card">
                    <div className="swatch-inline" style={{ background: analysis.hex }} />
                    <div className="result-summary-text">
                      {resultLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  </div>

                  <div className="roi-grid">
                    {analysis.regions.map((region) => (
                      <div key={region.name} className="roi-card">
                        <div className="roi-card-top">
                          <div>
                            <div className="roi-title">{region.label}</div>
                            <div className="roi-subtitle">
                              {region.tone} · {region.sampleCount} px
                            </div>
                          </div>
                          <div className="roi-swatch" style={{ background: region.hex }} />
                        </div>

                        <div className="roi-lines">
                          <div>Lab ({round(region.avgLab.L)}, {round(region.avgLab.a)}, {round(region.avgLab.b)})</div>
                          <div>h° {round(region.lch.h)} · C*ab {round(region.lch.C)}</div>
                          <div>Warm {round(region.warmScore)} · Cool {round(region.coolScore)}</div>
                        </div>
                      </div>
                    ))}
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
                    <div className={`quality-item ${analysis.quality.regionAgreementOk ? "quality-ok" : "quality-bad"}`}>
                      부위 일관성: {analysis.quality.regionAgreementOk ? "양호" : "편차 큼"}
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
              아직 업로드된 얼굴 사진이 없습니다. 정면 얼굴 사진을 올리면 좌볼/우볼/턱 기준 피부색 분석과 얼굴 누끼를 생성합니다.
            </div>
          )}
        </div>
      </div>

      <canvas ref={sourceCanvasRef} style={{ display: "none" }} />
      <canvas ref={cutoutCanvasRef} style={{ display: "none" }} />
    </section>
  );
}