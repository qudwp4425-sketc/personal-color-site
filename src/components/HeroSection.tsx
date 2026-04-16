export default function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-text-col">
        <div className="eyebrow">Personal Color Lab</div>

        <h1>얼굴 사진 기반 퍼스널컬러 분석 & CIELAB 색상 시뮬레이터</h1>

        <p>
          얼굴 사진을 업로드해 퍼스널컬러를 분석하고 웜톤·쿨톤 드레이프 비교,
          Lab·RGB·LCh 기반 색상 시뮬레이션과 색상 비교 기능을 한 화면에서 확인할 수 있습니다.
        </p>

        <div className="button-row">
          <a href="#simulator" className="btn btn-primary-link">
            시뮬레이터 열기
          </a>
          <a href="#color-compare" className="btn btn-secondary-link">
            색상 비교
          </a>
          <a href="#personal-color" className="btn btn-secondary-link">
            퍼스널컬러 찾기
          </a>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-title">Lab · RGB · LCh 연결</div>
            <div className="feature-text">
              색공간을 오가며 좌표와 실제 표시색을 동시에 확인할 수 있습니다.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-title">퍼스널컬러 근사 분석</div>
            <div className="feature-text">
              얼굴 사진의 중앙 피부 영역을 기반으로 Lab, hue angle, chroma를 계산하고
              웜/쿨 경향을 추정합니다.
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-title">이미지 픽셀 샘플링</div>
            <div className="feature-text">
              업로드한 이미지나 스크린샷에서 픽셀 RGB와 Lab 값을 직접 읽을 수 있습니다.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}