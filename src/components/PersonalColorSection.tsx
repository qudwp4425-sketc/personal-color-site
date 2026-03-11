import { useEffect, useMemo, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { InfoChip, SectionHeader } from "./Cards";
import { labToLch, rgb255ToHex, round, srgb255ToLab } from "../lib/color";

type RegionName = "leftCheek" | "rightCheek" | "chin";
type Tone = "Warm" | "Cool" | "Neutral";
type Confidence = "High" | "Medium" | "Low";
type TemperatureGroup = "warm" | "cool";

type Point = { x: number; y: number };

type RegionAnalysis = {
  name: RegionName;
  label: string;
  avgLab: { L: number; a: number; b: number };
  lch: { L: number; C: number; h: number };
  avgRgb: { r: number; g: number; b: number };
  hex: string;
  sampleCount: number;
};

type DrapeScore = {
  id: string;
  label: string;
  group: TemperatureGroup;
  hex: string;
  score: number;
};

type AnalysisResult = {
  avgLab: { L: number; a: number; b: number };
  lch: { L: number; C: number; h: number };
  tone: Tone;
  confidence: Confidence;
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
  drapeComparison: {
    recommendedGroup: TemperatureGroup | "neutral";
    warmAverage: number;
    coolAverage: number;
    items: DrapeScore[];
    selectedDrapeId: string;
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

const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const DRAPE_PRESETS: Array<{ id: string; label: string; group: TemperatureGroup; hex: string }> = [
  { id: "warm-beige", label: "Warm Beige", group: "warm", hex: "#D7B79A" },
  { id: "warm-camel", label: "Camel", group: "warm", hex: "#B88353" },
  { id: "warm-coral", label: "Coral", group: "warm", hex: "#E98B73" },
  { id: "warm-olive", label: "Olive", group: "warm", hex: "#8B8A47" },
  { id: "cool-rose", label: "Cool Rose", group: "cool", hex: "#D58AA8" },
  { id: "cool-lavender", label: "Lavender", group: "cool", hex: "#A89BD6" },
  { id: "cool-bluegray", label: "Blue Gray", group: "cool", hex: "#7B8FA8" },
  { id: "cool-icypink", label: "Icy Pink", group: "cool", hex: "#E7CADB" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb255(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
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

function averagePoint(points: Point[]) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function getLandmarkPoint(landmarks: { x: number; y: number }[], index: number, width: number, height: number): Point {
  const point = landmarks[index];
  return { x: point.x * width, y: point.y * height };
}

function getRegionCenter(
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  indices: number[],
): Point {
  return averagePoint(indices.map((index) => getLandmarkPoint(landmarks, index, width, height)));
}

function getCircularHueDistance(h1: number, h2: number) {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

function getBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getExpandedOvalPoints(points: Point[]) {
  const bounds = getBounds(points);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const faceHeight = bounds.maxY - bounds.minY;

  return points.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;

    let scaleX = 1.06;
    let scaleY = 1.04;
    let offsetY = 0;

    if (point.y < centerY) {
      scaleX = 1.14;
      scaleY = 1.16;
      offsetY = -faceHeight * 0.08;
    }

    return {
      x: centerX + dx * scaleX,
      y: centerY + dy * scaleY + offsetY,
    };
  });
}

function drawClosedPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    const midY = (prev.y + current.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }

  const last = points[points.length - 1];
  const first = points[0];
  const closingMidX = (last.x + first.x) / 2;
  const closingMidY = (last.y + first.y) / 2;
  ctx.quadraticCurveTo(last.x, last.y, closingMidX, closingMidY);
  ctx.quadraticCurveTo(first.x, first.y, first.x, first.y);
  ctx.closePath();
}

function sampleEllipseRegion(params: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  center: Point;
  rx: number;
  ry: number;
  label: string;
  name: RegionName;
}) {
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let sumR = 0;
  let sumG = 0;
  let sumBl = 0;
  let count = 0;

  const minX = Math.max(0, Math.floor(params.center.x - params.rx));
  const maxX = Math.min(params.width - 1, Math.ceil(params.center.x + params.rx));
  const minY = Math.max(0, Math.floor(params.center.y - params.ry));
  const maxY = Math.min(params.height - 1, Math.ceil(params.center.y + params.ry));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const nx = (x - params.center.x) / params.rx;
      const ny = (y - params.center.y) / params.ry;
      if (nx * nx + ny * ny > 1) continue;

      const idx = (y * params.width + x) * 4;
      const r = params.data[idx];
      const g = params.data[idx + 1];
      const b = params.data[idx + 2];

      if (!isSkinLike(r, g, b)) continue;

      const lab = srgb255ToLab(r, g, b);

      sumL += lab.L;
      sumA += lab.a;
      sumB += lab.b;
      sumR += r;
      sumG += g;
      sumBl += b;
      count += 1;
    }
  }

  if (count < 80) return null;

  const avgLab = {
    L: sumL / count,
    a: sumA / count,
    b: sumB / count,
  };

  const avgRgb = {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumBl / count),
  };

  return {
    name: params.name,
    label: params.label,
    avgLab,
    lch: labToLch(avgLab.L, avgLab.a, avgLab.b),
    avgRgb,
    hex: rgb255ToHex(avgRgb),
    sampleCount: count,
  } satisfies RegionAnalysis;
}

function scoreDrapeAgainstSkin(
  drapeHex: string,
  group: TemperatureGroup,
  skinLab: { L: number; a: number; b: number },
  skinLch: { L: number; C: number; h: number },
) {
  const drapeRgb = hexToRgb255(drapeHex);
  const drapeLab = srgb255ToLab(drapeRgb.r, drapeRgb.g, drapeRgb.b);
  const drapeLch = labToLch(drapeLab.L, drapeLab.a, drapeLab.b);

  const hueGap = getCircularHueDistance(skinLch.h, drapeLch.h);
  const lightnessGap = Math.abs(skinLab.L - drapeLab.L);
  const chromaGap = Math.abs(skinLch.C - drapeLch.C);

  const hueFit = 1 - clamp(hueGap / 120, 0, 1);
  const lightnessFit = 1 - clamp(Math.abs(lightnessGap - 18) / 28, 0, 1);
  const chromaFit = 1 - clamp(chromaGap / 45, 0, 1);

  const warmBias = clamp((skinLab.b - skinLab.a + 6) / 18, 0, 1);
  const coolBias = clamp((skinLab.a - skinLab.b + 8) / 18, 0, 1);

  let temperatureBonus = 0;
  if (group === "warm") {
    temperatureBonus = warmBias * 16 - coolBias * 6;
  } else {
    temperatureBonus = coolBias * 16 - warmBias * 6;
  }

  return clamp(100 * (0.42 * hueFit + 0.33 * lightnessFit + 0.25 * chromaFit) + temperatureBonus, 0, 100);
}

function getConfidence(params: {
  sampleCount: number;
  brightnessOk: boolean;
  symmetryOk: boolean;
  resolutionOk: boolean;
  regionAgreementOk: boolean;
}) {
  let score = 0;
  if (params.sampleCount > 500) score += 1;
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

  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");

  const [uploadedImage, setUploadedImage] = useState<null | {
    src: string;
    name: string;
    width: number;
    height: number;
  }>(null);

  const [cutoutSrc, setCutoutSrc] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedDrapeId, setSelectedDrapeId] = useState<string>(DRAPE_PRESETS[0].id);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "IMAGE",
          numFaces: 1,
        });

        if (!isMounted) return;
        setFaceLandmarker(landmarker);
        setModelStatus("ready");
      } catch {
        if (!isMounted) return;
        setModelStatus("error");
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedDrape = useMemo(() => {
    const byResult = analysis?.drapeComparison.items.find((item) => item.id === selectedDrapeId);
    if (byResult) return byResult;
    return DRAPE_PRESETS[0];
  }, [analysis, selectedDrapeId]);

  const resultLines = useMemo(() => {
    if (!analysis) return [];
    return [
      `Lab (${round(analysis.avgLab.L)}, ${round(analysis.avgLab.a)}, ${round(analysis.avgLab.b)})`,
      `h° ${round(analysis.lch.h)} · C*ab ${round(analysis.lch.C)}`,
      `RGB ${analysis.avgRgb.r}, ${analysis.avgRgb.g}, ${analysis.avgRgb.b}`,
      `HEX ${analysis.hex}`,
      `Tone ${analysis.tone} · Confidence ${analysis.confidence}`,
      `Warm Avg ${round(analysis.drapeComparison.warmAverage)} · Cool Avg ${round(analysis.drapeComparison.coolAverage)}`,
    ];
  }, [analysis]);

  const loadImageFile = (file: File) => {
    if (!faceLandmarker) return;

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

        const detectResult = faceLandmarker.detect(img);
        const landmarks = detectResult.faceLandmarks?.[0];

        setUploadedImage({
          src,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });

        if (!landmarks) {
          setCutoutSrc(null);
          setAnalysis(null);
          return;
        }

        const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const cctx = cutoutCanvas.getContext("2d", { willReadFrequently: true });
        if (!sctx || !cctx) return;

        sctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        cctx.clearRect(0, 0, cutoutCanvas.width, cutoutCanvas.height);
        sctx.drawImage(img, 0, 0);
        cctx.drawImage(img, 0, 0);

        const sourceImageData = sctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const data = sourceImageData.data;

        const ovalPoints = FACE_OVAL_INDICES.map((index) =>
          getLandmarkPoint(landmarks, index, sourceCanvas.width, sourceCanvas.height),
        );
        const expandedOvalPoints = getExpandedOvalPoints(ovalPoints);

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = cutoutCanvas.width;
        maskCanvas.height = cutoutCanvas.height;
        const mctx = maskCanvas.getContext("2d");
        if (!mctx) return;

        mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        mctx.filter = "blur(8px)";
        mctx.fillStyle = "rgba(255,255,255,1)";
        drawClosedPath(mctx, expandedOvalPoints);
        mctx.fill();

        cctx.globalCompositeOperation = "destination-in";
        cctx.drawImage(maskCanvas, 0, 0);
        cctx.globalCompositeOperation = "source-over";

        const cutoutUrl = cutoutCanvas.toDataURL("image/png");
        setCutoutSrc(cutoutUrl);

        const leftCheekCenter = getRegionCenter(landmarks, sourceCanvas.width, sourceCanvas.height, [234, 93, 132]);
        const rightCheekCenter = getRegionCenter(landmarks, sourceCanvas.width, sourceCanvas.height, [454, 323, 361]);
        const chinTip = getLandmarkPoint(landmarks, 152, sourceCanvas.width, sourceCanvas.height);
        const lowerLip = getLandmarkPoint(landmarks, 17, sourceCanvas.width, sourceCanvas.height);
        const chinCenter = {
          x: (chinTip.x * 0.62) + (lowerLip.x * 0.38),
          y: (chinTip.y * 0.62) + (lowerLip.y * 0.38),
        };

        const bounds = getBounds(ovalPoints);
        const faceWidth = bounds.maxX - bounds.minX;
        const faceHeight = bounds.maxY - bounds.minY;

        const regionAnalyses = [
          sampleEllipseRegion({
            data,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
            center: leftCheekCenter,
            rx: faceWidth * 0.09,
            ry: faceHeight * 0.08,
            label: "좌볼",
            name: "leftCheek",
          }),
          sampleEllipseRegion({
            data,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
            center: rightCheekCenter,
            rx: faceWidth * 0.09,
            ry: faceHeight * 0.08,
            label: "우볼",
            name: "rightCheek",
          }),
          sampleEllipseRegion({
            data,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
            center: chinCenter,
            rx: faceWidth * 0.085,
            ry: faceHeight * 0.065,
            label: "턱",
            name: "chin",
          }),
        ].filter(Boolean) as RegionAnalysis[];

        if (regionAnalyses.length < 2) {
          setAnalysis(null);
          return;
        }

        const totalWeight = regionAnalyses.reduce((acc, region) => acc + region.sampleCount, 0);

        const avgLab = {
          L: regionAnalyses.reduce((acc, region) => acc + region.avgLab.L * region.sampleCount, 0) / totalWeight,
          a: regionAnalyses.reduce((acc, region) => acc + region.avgLab.a * region.sampleCount, 0) / totalWeight,
          b: regionAnalyses.reduce((acc, region) => acc + region.avgLab.b * region.sampleCount, 0) / totalWeight,
        };

        const avgRgb = {
          r: Math.round(regionAnalyses.reduce((acc, region) => acc + region.avgRgb.r * region.sampleCount, 0) / totalWeight),
          g: Math.round(regionAnalyses.reduce((acc, region) => acc + region.avgRgb.g * region.sampleCount, 0) / totalWeight),
          b: Math.round(regionAnalyses.reduce((acc, region) => acc + region.avgRgb.b * region.sampleCount, 0) / totalWeight),
        };

        const lch = labToLch(avgLab.L, avgLab.a, avgLab.b);

        const warmItems = DRAPE_PRESETS
          .filter((item) => item.group === "warm")
          .map((item) => ({
            ...item,
            score: scoreDrapeAgainstSkin(item.hex, item.group, avgLab, lch),
          }));

        const coolItems = DRAPE_PRESETS
          .filter((item) => item.group === "cool")
          .map((item) => ({
            ...item,
            score: scoreDrapeAgainstSkin(item.hex, item.group, avgLab, lch),
          }));

        const allDrapeItems = [...warmItems, ...coolItems].sort((a, b) => b.score - a.score);

        const warmAverage = warmItems.reduce((acc, item) => acc + item.score, 0) / warmItems.length;
        const coolAverage = coolItems.reduce((acc, item) => acc + item.score, 0) / coolItems.length;

        let tone: Tone = "Neutral";
        let recommendedGroup: TemperatureGroup | "neutral" = "neutral";
        const groupGap = warmAverage - coolAverage;

        if (groupGap >= 5.5) {
          tone = "Warm";
          recommendedGroup = "warm";
        } else if (groupGap <= -5.5) {
          tone = "Cool";
          recommendedGroup = "cool";
        }

        const leftRegion = regionAnalyses.find((region) => region.name === "leftCheek");
        const rightRegion = regionAnalyses.find((region) => region.name === "rightCheek");

        const symmetryDelta =
          leftRegion && rightRegion ? Math.abs(leftRegion.avgLab.L - rightRegion.avgLab.L) : 99;

        const regionHueSpread =
          Math.max(...regionAnalyses.map((region) => region.lch.h)) -
          Math.min(...regionAnalyses.map((region) => region.lch.h));

        const regionBSpread =
          Math.max(...regionAnalyses.map((region) => region.avgLab.b)) -
          Math.min(...regionAnalyses.map((region) => region.avgLab.b));

        const brightnessOk = avgLab.L >= 45 && avgLab.L <= 82;
        const symmetryOk = symmetryDelta <= 8;
        const resolutionOk = img.naturalWidth >= 480 && img.naturalHeight >= 480;
        const regionAgreementOk = regionHueSpread <= 28 && regionBSpread <= 8;

        const confidence = getConfidence({
          sampleCount: totalWeight,
          brightnessOk,
          symmetryOk,
          resolutionOk,
          regionAgreementOk,
        });

        const bestDrape = allDrapeItems[0];
        setSelectedDrapeId(bestDrape.id);

        setAnalysis({
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
          drapeComparison: {
            recommendedGroup,
            warmAverage,
            coolAverage,
            items: allDrapeItems,
            selectedDrapeId: bestDrape.id,
          },
        });
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  };

  return (
    <section id="personal-color" className="section">
      <SectionHeader
        eyebrow="Personal Color"
        title="Face Mesh + Drape Comparison Analyzer"
        description="Face Mesh로 좌볼, 우볼, 턱 ROI를 잡고, warm / cool 드레이프 팔레트와의 조화 점수를 비교해 톤을 추정합니다. 사진 1장 기반 분석이라 조명과 화이트밸런스 영향은 여전히 존재합니다."
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
            {modelStatus === "loading" && "Face Mesh 모델을 불러오는 중입니다."}
            {modelStatus === "ready" &&
              "Face Mesh로 좌볼·우볼·턱 ROI를 자동 추출하고 warm/cool 드레이프 팔레트 점수를 비교합니다."}
            {modelStatus === "error" &&
              "Face Mesh 모델 로딩에 실패했습니다. 네트워크 상태를 확인하고 새로고침 후 다시 시도하세요."}
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
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={modelStatus !== "ready"}
            >
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
                  <div className="mini-label">누끼 + 드레이프 프리뷰</div>
                  <div className="portrait-frame portrait-drape-stage" style={{ background: selectedDrape.hex }}>
                    {cutoutSrc ? <img src={cutoutSrc} alt="Face cutout" className="portrait-image" /> : null}
                    <div className="drape-neck-band" style={{ background: selectedDrape.hex }} />
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
                            <div className="roi-subtitle">{region.sampleCount} px</div>
                          </div>
                          <div className="roi-swatch" style={{ background: region.hex }} />
                        </div>

                        <div className="roi-lines">
                          <div>Lab ({round(region.avgLab.L)}, {round(region.avgLab.a)}, {round(region.avgLab.b)})</div>
                          <div>h° {round(region.lch.h)} · C*ab {round(region.lch.C)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="drape-section">
                    <div className="drape-header-row">
                      <div>
                        <div className="roi-title">드레이프 비교</div>
                        <div className="roi-subtitle">
                          추천 그룹: {analysis.drapeComparison.recommendedGroup}
                        </div>
                      </div>
                      <div className="chip-row" style={{ marginTop: 0 }}>
                        <InfoChip text={`Warm ${round(analysis.drapeComparison.warmAverage)}`} secondary />
                        <InfoChip text={`Cool ${round(analysis.drapeComparison.coolAverage)}`} secondary />
                      </div>
                    </div>

                    <div className="drape-grid">
                      {analysis.drapeComparison.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`drape-card ${selectedDrapeId === item.id ? "drape-card-active" : ""}`}
                          onClick={() => setSelectedDrapeId(item.id)}
                        >
                          <div className="drape-color" style={{ background: item.hex }} />
                          <div className="drape-meta">
                            <div className="drape-name">{item.label}</div>
                            <div className="drape-sub">
                              {item.group} · {round(item.score)}
                            </div>
                          </div>
                        </button>
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
                    <div className={`quality-item ${analysis.quality.regionAgreementOk ? "quality-ok" : "quality-bad"}`}>
                      ROI 일관성: {analysis.quality.regionAgreementOk ? "양호" : "편차 큼"}
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
                  얼굴 랜드마크 또는 피부 ROI 추출이 충분하지 않습니다. 얼굴이 더 크게 보이고 조명이 균일한 사진으로 다시 업로드하세요.
                </div>
              )}
            </>
          ) : (
            <div className="empty-box">
              아직 업로드된 얼굴 사진이 없습니다. Face Mesh를 이용해 좌볼/우볼/턱 ROI를 추출하고 드레이프 비교 점수를 계산합니다.
            </div>
          )}
        </div>
      </div>

      <canvas ref={sourceCanvasRef} style={{ display: "none" }} />
      <canvas ref={cutoutCanvasRef} style={{ display: "none" }} />
    </section>
  );
}
