import "./styles.css";
import HeroSection from "./components/HeroSection";
import AboutSection from "./components/AboutSection";
import SimulatorSection from "./components/SimulatorSection";

export default function App() {
  return (
    <div className="page">
      <div className="hero-bg" />
      <main className="main">
        <HeroSection />
        <AboutSection />
        <SimulatorSection />
      </main>
    </div>
  );
}