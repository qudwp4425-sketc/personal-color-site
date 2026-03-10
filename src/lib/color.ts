export const PLANE_SIZE = 460;
export const A_MIN = -128;
export const A_MAX = 127;
export const B_MIN = -128;
export const B_MAX = 127;
export const D50 = { x: 0.9642, y: 1.0, z: 0.8251 };
export const IMAGE_PREVIEW_MAX_WIDTH = 520;
export const IMAGE_PREVIEW_MAX_HEIGHT = 360;

export type LabColor = { L: number; a: number; b: number };
export type Rgb255 = { r: number; g: number; b: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseLabInput(value: string) {
  const normalized = value.trim().replace(/,/g, ".");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRgbInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rgbToHex(rgb: { r: number; g: number; b: number }) {
  const toHex = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

export function rgb255ToHex(rgb: Rgb255) {
  const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function encodeSrgb(channel: number) {
  if (channel <= 0.0031308) return 12.92 * channel;
  return 1.055 * channel ** (1 / 2.4) - 0.055;
}

function decodeSrgb(channel: number) {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function labToXyzD50(L: number, a: number, b: number) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;

  const fx3 = fx ** 3;
  const fy3 = fy ** 3;
  const fz3 = fz ** 3;

  const xr = fx3 > epsilon ? fx3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * epsilon ? fy3 : L / kappa;
  const zr = fz3 > epsilon ? fz3 : (116 * fz - 16) / kappa;

  return {
    x: xr * D50.x,
    y: yr * D50.y,
    z: zr * D50.z,
  };
}

function xyzD50ToLab(xyz: { x: number; y: number; z: number }) {
  const xr = xyz.x / D50.x;
  const yr = xyz.y / D50.y;
  const zr = xyz.z / D50.z;

  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (t: number) => (t > epsilon ? t ** (1 / 3) : (kappa * t + 16) / 116);

  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function xyzD50ToD65(xyz: { x: number; y: number; z: number }) {
  return {
    x: xyz.x * 0.9555766 + xyz.y * -0.0230393 + xyz.z * 0.0631636,
    y: xyz.x * -0.0282895 + xyz.y * 1.0099416 + xyz.z * 0.0210077,
    z: xyz.x * 0.0122982 + xyz.y * -0.020483 + xyz.z * 1.3299098,
  };
}

function xyzD65ToD50(xyz: { x: number; y: number; z: number }) {
  return {
    x: xyz.x * 1.0478112 + xyz.y * 0.0228866 + xyz.z * -0.050127,
    y: xyz.x * 0.0295424 + xyz.y * 0.9904844 + xyz.z * -0.0170491,
    z: xyz.x * -0.0092345 + xyz.y * 0.0150436 + xyz.z * 0.7521316,
  };
}

function xyzD65ToLinearSrgb(xyz: { x: number; y: number; z: number }) {
  return {
    r: xyz.x * 3.2404542 + xyz.y * -1.5371385 + xyz.z * -0.4985314,
    g: xyz.x * -0.969266 + xyz.y * 1.8760108 + xyz.z * 0.041556,
    b: xyz.x * 0.0556434 + xyz.y * -0.2040259 + xyz.z * 1.0572252,
  };
}

function linearSrgbToXyzD65(rgb: { r: number; g: number; b: number }) {
  return {
    x: rgb.r * 0.4124564 + rgb.g * 0.3575761 + rgb.b * 0.1804375,
    y: rgb.r * 0.2126729 + rgb.g * 0.7151522 + rgb.b * 0.072175,
    z: rgb.r * 0.0193339 + rgb.g * 0.119192 + rgb.b * 0.9503041,
  };
}

export function labToSrgb(L: number, a: number, b: number) {
  const xyz50 = labToXyzD50(L, a, b);
  const xyz65 = xyzD50ToD65(xyz50);
  const linear = xyzD65ToLinearSrgb(xyz65);

  const encoded = {
    r: encodeSrgb(linear.r),
    g: encodeSrgb(linear.g),
    b: encodeSrgb(linear.b),
  };

  const inGamut =
    linear.r >= 0 && linear.r <= 1 && linear.g >= 0 && linear.g <= 1 && linear.b >= 0 && linear.b <= 1;

  const clipped = {
    r: clamp(encoded.r, 0, 1),
    g: clamp(encoded.g, 0, 1),
    b: clamp(encoded.b, 0, 1),
  };

  return {
    rgb: clipped,
    rgb255: {
      r: Math.round(clipped.r * 255),
      g: Math.round(clipped.g * 255),
      b: Math.round(clipped.b * 255),
    },
    hex: rgbToHex(clipped),
    inGamut,
  };
}

export function srgb255ToLab(r255: number, g255: number, b255: number) {
  const rgb = {
    r: clamp(r255, 0, 255) / 255,
    g: clamp(g255, 0, 255) / 255,
    b: clamp(b255, 0, 255) / 255,
  };

  const linear = {
    r: decodeSrgb(rgb.r),
    g: decodeSrgb(rgb.g),
    b: decodeSrgb(rgb.b),
  };

  const xyz65 = linearSrgbToXyzD65(linear);
  const xyz50 = xyzD65ToD50(xyz65);
  return xyzD50ToLab(xyz50);
}

export function labToLch(L: number, a: number, b: number) {
  const C = Math.sqrt(a ** 2 + b ** 2);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function aToX(a: number) {
  return ((a - A_MIN) / (A_MAX - A_MIN)) * PLANE_SIZE;
}

export function bToY(b: number) {
  return PLANE_SIZE - ((b - B_MIN) / (B_MAX - B_MIN)) * PLANE_SIZE;
}

export function xToA(x: number) {
  return A_MIN + (clamp(x, 0, PLANE_SIZE) / PLANE_SIZE) * (A_MAX - A_MIN);
}

export function yToB(y: number) {
  return B_MIN + ((PLANE_SIZE - clamp(y, 0, PLANE_SIZE)) / PLANE_SIZE) * (B_MAX - B_MIN);
}