export default function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-text-col">
        <div className="eyebrow">Personal Color Lab</div>
        <h1 className="hero-title">CIELAB 색공간을 직접 만져보는 개인 홈페이지</h1>
        <p className="hero-description">
          이 페이지는 CIELAB, RGB, LCh, 이미지 샘플링을 한 화면에서 다루기 위한 개인용 색채 도구입니다.
          피부색 분석, 제품 색 검토, UI 색 확인, 색좌표 학습용으로 바로 쓸 수 있게 구성했습니다.
        </p>

        <div className="button-row">
          <a href="#simulator" className="btn btn-primary-link">
            시뮬레이터 열기
          </a>
          <a href="#about" className="btn btn-secondary-link">
            소개 보기
          </a>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-title">Lab · RGB · LCh 연결</div>
            <div className="feature-text">색공간을 오가며 좌표와 실제 표시색을 동시에 확인할 수 있습니다.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">sRGB 기준 미리보기</div>
            <div className="feature-text">D50 Lab를 sRGB(D65)로 변환해 브라우저에서 보이는 색을 바로 확인합니다.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">이미지 픽셀 샘플링</div>
            <div className="feature-text">업로드한 이미지나 스크린샷에서 픽셀 RGB와 Lab 값을 직접 읽을 수 있습니다.</div>
          </div>
        </div>
      </div>
    </section>
  );
}