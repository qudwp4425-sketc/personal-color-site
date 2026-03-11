import { useState } from "react";
import "./styles.css";
import HeroSection from "./components/HeroSection";
import AboutSection from "./components/AboutSection";
import SimulatorSection from "./components/SimulatorSection";
import PersonalColorSection from "./components/PersonalColorSection";

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
    }>;
    drapeComparison: {
      recommendedGroup: "warm" | "cool" | "neutral";
      warmAverage: number;
      coolAverage: number;
      items: Array<{
        id: string;
        label: string;
        group: "warm" | "cool";
        hex: string;
        score: number;
      }>;
      selectedDrapeId: string;
    };
  };
};

export default function App() {
  const [appliedPortrait, setAppliedPortrait] = useState<AppliedPortrait | null>(null);

  return (
    <div className="page">
      <div className="hero-bg" />
      <main className="main">
        <HeroSection />
        <PersonalColorSection onApplyToSimulator={setAppliedPortrait} />
        <AboutSection />
        <SimulatorSection appliedPortrait={appliedPortrait} />
      </main>
    </div>
  );
}