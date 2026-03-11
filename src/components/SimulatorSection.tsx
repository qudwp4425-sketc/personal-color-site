import { useEffect, useMemo, useRef, useState } from "react";
import Field from "./Field";
import { ColorInfoCard, InfoChip, SectionHeader } from "./Cards";
import {
  A_MAX,
  A_MIN,
  B_MAX,
  B_MIN,
  IMAGE_PREVIEW_MAX_HEIGHT,
  IMAGE_PREVIEW_MAX_WIDTH,
  PLANE_SIZE,
  aToX,
  bToY,
  clamp,
  labToLch,
  labToSrgb,
  parseLabInput,
  parseRgbInput,
  rgb255ToHex,
  round,
  srgb255ToLab,
  xToA,
  yToB,
} from "../lib/color";

type AppliedPortrait = {
  src: string;
  cutoutSrc: string;
  analysis: {
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
    regions: Array<{
      name: "leftCheek" | "rightCheek" | "chin";
      label: string;
      avgLab: { L: number; a: number; b: number };
      lch: { L: number; C: number; h: number };
      avgRgb: { r: number; g: number; b: number };
      hex: string;
      sampleCount: number;
      warmScore: number;
      coolScore: number;
      tone: "Warm" | "Cool" | "Neutral";
    }>;
    scoreSummary: {
      warm: number;
      cool: number;
      gap: number;
    };
  };
} | null;

type SimulatorSectionProps = {
  appliedPortrait: AppliedPortrait;
};

export default function SimulatorSection({ appliedPortrait }: SimulatorSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreviewRef = useRef<HTMLImageElement | null>(null);
  const imageSamplingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [planeDisplaySize, setPlaneDisplaySize] = useState(PLANE_SIZE);

  const [L, setL] = useState(60);
  const [selected, setSelected] = useState({ L: 60, a: 20, b: 20 });
  const [inputValues, setInputValues] = useState({ L: "60", a: "20", b: "20" });
  const [rgbInputValues, setRgbInputValues] = useState({ r: "191", g: "128", b: "101" });
  const [hover, setHover] = useState<null | { L: number; a: number; b: number; x: number; y: number }>(null);
  const [isDraggingSelected, setIsDraggingSelected] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<null | { src: string; name: string; width: number; height: number }>(null);
  const [imageSourceLabel, setImageSourceLabel] = useState("업로드된 이미지");
  const [imageHover, setImageHover] = useState<null | {
    previewX: number;
    previewY: number;
    imageX: number;
    imageY: number;
    rgb255: { r: number; g: number; b: number };
    hex: string;
    lab: { L: number; a: number; b: number };
  }>(null);

  const selectedColor = useMemo(() => labToSrgb(selected.L, selected.a, selected.b), [selected]);
  const selectedLch = useMemo(() => labToLch(selected.L, selected.a, selected.b), [selected]);
  const hoverColor = useMemo(() => (hover ? labToSrgb(hover.L, hover.a, hover.b) : null), [hover]);
  const hoverLch = useMemo(() => (hover ? labToLch(hover.L, hover.a, hover.b) : null), [hover]);
  const imageHoverLch = useMemo(
    () => (imageHover ? labToLch(imageHover.lab.L, imageHover.lab.a, imageHover.lab.b) : null),
    [imageHover]
  );

  const selectedDotLeft = (aToX(selected.a) / PLANE_SIZE) * planeDisplaySize;
  const selectedDotTop = (bToY(selected.b) / PLANE_SIZE) * planeDisplaySize;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const updateSize = () => {
      const next = Math.min(element.clientWidth || PLANE_SIZE, PLANE_SIZE);
      setPlaneDisplaySize(next);
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(element);
      window.addEventListener("resize", updateSize);

      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updateSize);
      };
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = ctx.createImageData(PLANE_SIZE, PLANE_SIZE);
    const data = image.data;
    let idx = 0;

    for (let y = 0; y < PLANE_SIZE; y += 1) {
      const b = yToB(y);
      for (let x = 0; x < PLANE_SIZE; x += 1) {
        const a = xToA(x);
        const { rgb, inGamut } = labToSrgb(L, a, b);

        data[idx] = Math.round(rgb.r * 255);
        data[idx + 1] = Math.round(rgb.g * 255);
        data[idx + 2] = Math.round(rgb.b * 255);
        data[idx + 3] = inGamut ? 255 : 145;
        idx += 4;
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [L]);

  useEffect(() => {
    const stopDragging = () => setIsDraggingSelected(false);
    window.addEventListener("pointerup", stopDragging);
    return () => window.removeEventListener("pointerup", stopDragging);
  }, []);

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      loadImageFile(file, "클립보드 이미지");
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, []);

  const getPlanePointerData = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    const displayX = clamp(event.clientX - rect.left, 0, rect.width);
    const displayY = clamp(event.clientY - rect.top, 0, rect.height);

    const planeX = clamp((displayX / rect.width) * PLANE_SIZE, 0, PLANE_SIZE);
    const planeY = clamp((displayY / rect.height) * PLANE_SIZE, 0, PLANE_SIZE);

    return {
      displayX,
      displayY,
      planeX,
      planeY,
      a: xToA(planeX),
      b: yToB(planeY),
    };
  };

  const setHoverFromPoint = (point: { displayX: number; displayY: number; a: number; b: number }) => {
    setHover({
      L,
      a: point.a,
      b: point.b,
      x: point.displayX,
      y: point.displayY,
    });
  };

  const isPointerOnSelectedDot = (displayX: number, displayY: number) => {
    const dx = displayX - selectedDotLeft;
    const dy = displayY - selectedDotTop;
    return Math.hypot(dx, dy) <= 24;
  };

  const handlePlanePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = getPlanePointerData(event);
    if (!point) return;

    setHoverFromPoint(point);

    if (!isDraggingSelected) return;

    const next = { L, a: point.a, b: point.b };
    setSelected(next);
    setInputValues({
      L: String(round(next.L, 2)),
      a: String(round(next.a, 2)),
      b: String(round(next.b, 2)),
    });
  };

  const handlePlanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = getPlanePointerData(event);
    if (!point) return;

    setHoverFromPoint(point);

    if (event.pointerType === "touch") {
      if (isPointerOnSelectedDot(point.displayX, point.displayY)) {
        setIsDraggingSelected(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else {
        setIsDraggingSelected(false);
      }
      return;
    }

    const next = { L, a: point.a, b: point.b };
    setSelected(next);
    setInputValues({
      L: String(round(next.L, 2)),
      a: String(round(next.a, 2)),
      b: String(round(next.b, 2)),
    });
    setIsDraggingSelected(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePlanePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && !isDraggingSelected) {
      setHover(null);
    }
  };

  const readImageSampleFromEvent = (event: React.PointerEvent<HTMLImageElement>) => {
    const preview = imagePreviewRef.current;
    const canvas = imageSamplingCanvasRef.current;
    if (!preview || !canvas || !uploadedImage) return null;

    const rect = preview.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;
    if (relativeX < 0 || relativeY < 0 || relativeX > rect.width || relativeY > rect.height) return null;

    const imageX = clamp(Math.floor((relativeX / rect.width) * canvas.width), 0, canvas.width - 1);
    const imageY = clamp(Math.floor((relativeY / rect.height) * canvas.height), 0, canvas.height - 1);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const pixel = ctx.getImageData(imageX, imageY, 1, 1).data;
    const rgb255 = { r: pixel[0], g: pixel[1], b: pixel[2] };
    const lab = srgb255ToLab(rgb255.r, rgb255.g, rgb255.b);

    return {
      previewX: clamp(relativeX, 0, rect.width),
      previewY: clamp(relativeY, 0, rect.height),
      imageX,
      imageY,
      rgb255,
      hex: rgb255ToHex(rgb255),
      lab,
    };
  };

  const handleImagePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    setImageHover(readImageSampleFromEvent(event));
  };

  const handleImagePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    const sample = readImageSampleFromEvent(event);
    if (!sample) return;

    const next = {
      L: clamp(sample.lab.L, 0, 100),
      a: clamp(sample.lab.a, A_MIN, A_MAX),
      b: clamp(sample.lab.b, B_MIN, B_MAX),
    };

    setL(next.L);
    setSelected(next);
    setInputValues({ L: String(round(next.L, 2)), a: String(round(next.a, 2)), b: String(round(next.b, 2)) });
    setRgbInputValues({ r: String(sample.rgb255.r), g: String(sample.rgb255.g), b: String(sample.rgb255.b) });
  };

  const loadImageSource = ({ src, name }: { src: string; name: string }) => {
    const img = new Image();
    img.onload = () => {
      const canvas = imageSamplingCanvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      setUploadedImage({ src, name, width: img.naturalWidth, height: img.naturalHeight });
      setImageHover(null);
    };
    img.src = src;
  };

  const loadImageFile = (file: File, sourceLabel = "업로드된 이미지") => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return;
      setImageSourceLabel(sourceLabel);
      loadImageSource({ src, name: file.name || "pasted-image" });
    };
    reader.readAsDataURL(file);
  };

  const applyInput = () => {
    const parsedL = parseLabInput(inputValues.L);
    const parsedA = parseLabInput(inputValues.a);
    const parsedB = parseLabInput(inputValues.b);

    const next = {
      L: clamp(parsedL ?? selected.L, 0, 100),
      a: clamp(parsedA ?? selected.a, A_MIN, A_MAX),
      b: clamp(parsedB ?? selected.b, B_MIN, B_MAX),
    };

    setL(next.L);
    setSelected(next);
    setInputValues({ L: String(round(next.L, 2)), a: String(round(next.a, 2)), b: String(round(next.b, 2)) });
  };

  const applyRgbInput = () => {
    const parsedR = parseRgbInput(rgbInputValues.r);
    const parsedG = parseRgbInput(rgbInputValues.g);
    const parsedB = parseRgbInput(rgbInputValues.b);

    const nextR = clamp(parsedR ?? selectedColor.rgb255.r, 0, 255);
    const nextG = clamp(parsedG ?? selectedColor.rgb255.g, 0, 255);
    const nextB = clamp(parsedB ?? selectedColor.rgb255.b, 0, 255);
    const nextLab = srgb255ToLab(nextR, nextG, nextB);

    const next = {
      L: clamp(nextLab.L, 0, 100),
      a: clamp(nextLab.a, A_MIN, A_MAX),
      b: clamp(nextLab.b, B_MIN, B_MAX),
    };

    setL(next.L);
    setSelected(next);
    setInputValues({ L: String(round(next.L, 2)), a: String(round(next.a, 2)), b: String(round(next.b, 2)) });
    setRgbInputValues({ r: String(Math.round(nextR)), g: String(Math.round(nextG)), b: String(Math.round(nextB)) });
  };

  const resetAll = () => {
    const next = { L: 60, a: 20, b: 20 };
    setL(next.L);
    setSelected(next);
    setInputValues({ L: "60", a: "20", b: "20" });
    setRgbInputValues({ r: "191", g: "128", b: "101" });
    setHover(null);
    setImageHover(null);
    setIsDraggingSelected(false);
  };

  const hoverLines =
    hover && hoverColor && hoverLch
      ? [
          `Lab (${round(hover.L)}, ${round(hover.a)}, ${round(hover.b)})`,
          `RGB ${hoverColor.rgb255.r}, ${hoverColor.rgb255.g}, ${hoverColor.rgb255.b}`,
          `HEX ${hoverColor.hex}`,
          `C*ab ${round(hoverLch.C)} · h° ${round(hoverLch.h)}`,
        ]
      : ["평면 위에 마우스를 올리면 색과 좌표가 표시됩니다."];

  const selectedLines = [
    `Lab (${round(selected.L)}, ${round(selected.a)}, ${round(selected.b)})`,
    `RGB ${selectedColor.rgb255.r}, ${selectedColor.rgb255.g}, ${selectedColor.rgb255.b}`,
    `HEX ${selectedColor.hex}`,
    `C*ab ${round(selectedLch.C)} · h° ${round(selectedLch.h)}`,
  ];

  const imagePreviewDimensions = useMemo(() => {
    if (!uploadedImage) return null;
    const scale = Math.min(
      IMAGE_PREVIEW_MAX_WIDTH / uploadedImage.width,
      IMAGE_PREVIEW_MAX_HEIGHT / uploadedImage.height,
      1
    );
    return {
      width: Math.round(uploadedImage.width * scale),
      height: Math.round(uploadedImage.height * scale),
    };
  }, [uploadedImage]);

  return (
    <section id="simulator" className="section">
      <SectionHeader
        eyebrow="Simulator"
        title="CIELAB Space Simulator"
        description="고정된 L*에서 a*–b* 평면을 탐색하고, Lab 입력, RGB 입력, 이미지 샘플링을 통해 실제 색상과 좌표를 연결해 볼 수 있습니다."
      />

      {appliedPortrait ? (
        <div className="card portrait-apply-card">
          <div className="row-between-wrap" style={{ marginBottom: 16 }}>
            <div>
              <h3 className="card-title" style={{ marginBottom: 8 }}>Applied Portrait Preview</h3>
              <div className="feature-text">
                퍼스널컬러 도구에서 가져온 얼굴 누끼입니다. 현재 선택한 Lab 색이 배경색으로 즉시 반영됩니다.
              </div>
            </div>

            <div className="chip-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <InfoChip text={`Tone ${appliedPortrait.analysis.tone}`} />
              <InfoChip text={`Confidence ${appliedPortrait.analysis.confidence}`} secondary />
              <InfoChip text={selectedColor.hex} secondary />
            </div>
          </div>

          <div className="portrait-stage-large" style={{ background: selectedColor.hex }}>
            <img src={appliedPortrait.cutoutSrc} alt="Applied portrait cutout" className="portrait-stage-image" />
          </div>
        </div>
      ) : null}

      <div
        className="simulator-grid"
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          alignItems: "start",
        }}
      >
        <div className="card" style={{ minWidth: 0 }}>
          <div
            className="row-between-wrap"
            style={{
              display: "flex",
              gap: 20,
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 280px" }}>
              <h3 className="card-title">a*–b* Plane at Fixed L*</h3>
              <div className="chip-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <InfoChip text={`L* ${round(L, 2)}`} />
                <InfoChip text={`a* ${A_MIN} to ${A_MAX}`} secondary />
                <InfoChip text={`b* ${B_MIN} to ${B_MAX}`} secondary />
              </div>
            </div>

            <div className="slider-wrap" style={{ width: "100%", maxWidth: 420, flex: "1 1 280px", minWidth: 0 }}>
              <div className="row-between">
                <span className="small-label">Lightness (L*)</span>
                <span className="small-muted">{round(L, 2)}</span>
              </div>
              <input
                className="range-slider"
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={L}
                onChange={(e) => {
                  const nextL = Number(e.target.value);
                  setL(nextL);
                  setSelected((prev) => ({ ...prev, L: nextL }));
                  setInputValues((prev) => ({ ...prev, L: String(round(nextL, 2)) }));
                  setHover((prev) => (prev ? { ...prev, L: nextL } : null));
                }}
              />
            </div>
          </div>

          <div
            className="plane-info-grid"
            style={{
              display: "grid",
              gap: 24,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="small-muted-row">Hover to inspect · Drag the circle to select</div>

              <div
                ref={wrapperRef}
                className="canvas-wrap"
                style={{
                  width: "100%",
                  maxWidth: PLANE_SIZE,
                  aspectRatio: "1 / 1",
                  height: "auto",
                  margin: "0 auto",
                  touchAction: "none",
                }}
                onPointerMove={handlePlanePointerMove}
                onPointerLeave={handlePlanePointerLeave}
                onPointerDown={handlePlanePointerDown}
              >
                <canvas
                  ref={canvasRef}
                  width={PLANE_SIZE}
                  height={PLANE_SIZE}
                  className="canvas"
                  style={{ width: "100%", height: "100%", display: "block" }}
                />
                <div className="cross-horizontal" />
                <div className="cross-vertical" />
                <div className="selected-dot" style={{ left: selectedDotLeft, top: selectedDotTop }} />
                {hover ? <div className="hover-dot" style={{ left: hover.x, top: hover.y }} /> : null}
              </div>

              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <div
                  className="axis-chip"
                  style={{
                    display: "inline-block",
                    minWidth: "100%",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    padding: "10px 14px",
                  }}
                >
                  top = +b* (yellow) · right = +a* (red) · left = −a* (green) · bottom = −b* (blue)
                </div>
              </div>
            </div>

            <div className="right-column" style={{ minWidth: 0 }}>
              <div
                className="two-col-grid"
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <ColorInfoCard title="Hovered Color" swatch={hoverColor?.hex ?? "#e2e8f0"} lines={hoverLines} empty={!hover} />
                <ColorInfoCard title="Selected Color" swatch={selectedColor.hex} lines={selectedLines} />
              </div>

              <div className="card">
                <h3 className="card-title">Set Lab Coordinates</h3>
                <div
                  className="form-grid"
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  }}
                >
                  <Field label="L*" value={inputValues.L} onChange={(value) => setInputValues((prev) => ({ ...prev, L: value }))} onCommit={applyInput} min={0} max={100} />
                  <Field label="a*" value={inputValues.a} onChange={(value) => setInputValues((prev) => ({ ...prev, a: value }))} onCommit={applyInput} min={A_MIN} max={A_MAX} />
                  <Field label="b*" value={inputValues.b} onChange={(value) => setInputValues((prev) => ({ ...prev, b: value }))} onCommit={applyInput} min={B_MIN} max={B_MAX} />
                </div>

                <div className="button-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={applyInput}>Apply Lab</button>
                  <button className="btn btn-secondary" onClick={resetAll}>Reset</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="right-column" style={{ minWidth: 0 }}>
          <div className="card">
            <h3 className="card-title">Image Sampler</h3>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                loadImageFile(file, "업로드된 이미지");
                e.target.value = "";
              }}
            />

            <div className="button-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => imageInputRef.current?.click()}>
                Upload Image
              </button>
            </div>

            <div
              className="paste-box"
              tabIndex={0}
              onPaste={(event) => {
                const items = Array.from(event.clipboardData?.items || []);
                const imageItem = items.find((item) => item.type.startsWith("image/"));
                if (!imageItem) return;
                const file = imageItem.getAsFile();
                if (!file) return;
                event.preventDefault();
                loadImageFile(file, "클립보드 이미지");
              }}
            >
              <div className="paste-title">스크린샷 붙여넣기</div>
              <div>
                이 영역을 클릭한 뒤 <strong>Ctrl+V</strong> 로 스크린샷을 붙여넣을 수 있습니다. 페이지가 포커스된 상태라면 창 어디서든 이미지 붙여넣기도 동작합니다.
              </div>
            </div>

            <div className="note-box note-blue">
              업로드하거나 붙여넣은 이미지는 sRGB 이미지로 가정하고 픽셀 RGB를 읽어 Lab로 변환합니다. 카메라 화이트밸런스와 조명 조건은 반영되지 않습니다.
            </div>

            {uploadedImage ? (
              <>
                <div className="image-meta">
                  <div className="chip-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <InfoChip text={uploadedImage.name} />
                    <InfoChip text={imageSourceLabel} secondary />
                    <InfoChip text={`${uploadedImage.width} × ${uploadedImage.height}`} secondary />
                  </div>

                  <div className="image-frame" style={{ width: "100%", overflow: "hidden" }}>
                    <div className="image-relative" style={{ width: "100%" }}>
                      <img
                        ref={imagePreviewRef}
                        src={uploadedImage.src}
                        alt="Uploaded sample"
                        className="preview-image"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          maxWidth: imagePreviewDimensions?.width ?? IMAGE_PREVIEW_MAX_WIDTH,
                          maxHeight: IMAGE_PREVIEW_MAX_HEIGHT,
                          objectFit: "contain",
                        }}
                        onPointerMove={handleImagePointerMove}
                        onPointerLeave={() => setImageHover(null)}
                        onPointerDown={handleImagePointerDown}
                      />
                      {imageHover ? <div className="selected-dot" style={{ left: imageHover.previewX, top: imageHover.previewY }} /> : null}
                    </div>
                  </div>
                </div>

                <ColorInfoCard
                  title="Image Pixel Inspector"
                  swatch={imageHover?.hex ?? "#e2e8f0"}
                  lines={
                    imageHover && imageHoverLch
                      ? [
                          `Pixel (${imageHover.imageX}, ${imageHover.imageY})`,
                          `RGB ${imageHover.rgb255.r}, ${imageHover.rgb255.g}, ${imageHover.rgb255.b}`,
                          `HEX ${imageHover.hex}`,
                          `Lab (${round(imageHover.lab.L)}, ${round(imageHover.lab.a)}, ${round(imageHover.lab.b)})`,
                          `C*ab ${round(imageHoverLch.C)} · h° ${round(imageHoverLch.h)}`,
                        ]
                      : ["이미지 위에 마우스를 올리면 해당 픽셀의 RGB와 Lab 값이 표시됩니다."]
                  }
                  empty={!imageHover}
                />
              </>
            ) : (
              <div className="empty-box">
                아직 이미지가 없습니다. 파일 업로드나 스크린샷 붙여넣기 후 픽셀 단위 RGB/Lab 샘플링이 가능합니다.
              </div>
            )}

            <canvas ref={imageSamplingCanvasRef} style={{ display: "none" }} />
          </div>

          <div className="card">
            <h3 className="card-title">Set RGB Coordinates</h3>

            <div
              className="form-grid form-grid-sidebar"
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              }}
            >
              <Field label="R" value={rgbInputValues.r} onChange={(value) => setRgbInputValues((prev) => ({ ...prev, r: value }))} onCommit={applyRgbInput} min={0} max={255} />
              <Field label="G" value={rgbInputValues.g} onChange={(value) => setRgbInputValues((prev) => ({ ...prev, g: value }))} onCommit={applyRgbInput} min={0} max={255} />
              <Field label="B" value={rgbInputValues.b} onChange={(value) => setRgbInputValues((prev) => ({ ...prev, b: value }))} onCommit={applyRgbInput} min={0} max={255} />
            </div>

            <div className="button-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={applyRgbInput}>Apply RGB</button>
              <button className="btn btn-secondary" onClick={resetAll}>Reset</button>
            </div>

            <div className="note-box note-blue">
              RGB 입력은 sRGB 0–255 기준입니다. 값을 넣고 적용하면 sRGB → XYZ(D65) → XYZ(D50) → Lab로 변환해 평면 좌표와 Lab 값을 함께 갱신합니다.
            </div>

            <div className="note-box note-amber">
              CIELAB는 장치 독립 색공간이지만 브라우저 화면은 sRGB로 표시되므로 일부 Lab 좌표는 정확히 표시되지 않습니다. 이 경우 가장 가까운 sRGB로 잘라서 보여줍니다.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}