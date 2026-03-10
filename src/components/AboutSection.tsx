import { SectionHeader } from "./Cards";

export default function AboutSection() {
  return (
    <section id="about" className="section">
      <SectionHeader
        eyebrow="About"
        title="무엇을 위한 홈페이지인가"
        description="CIELAB를 설명만으로 이해하기 어렵다는 문제를 줄이기 위해 만들었습니다. 숫자와 실제 보이는 색, 좌표 위치, 이미지 샘플링을 한 화면에 모아 색채 해석을 직관적으로 하도록 구성했습니다."
      />

      <div className="about-grid">
        <div className="card">
          <h3 className="card-title">색좌표 학습</h3>
          <p className="card-text">
            a*와 b*가 어떤 방향으로 움직이는지, L*가 변하면 어떤 단면이 열리는지 직접 보면서 학습할 수 있습니다.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">제품/디자인 검토</h3>
          <p className="card-text">
            시안 이미지나 캡처 화면의 픽셀 색을 읽고, RGB 수치와 Lab 수치를 동시에 확인해 비교할 수 있습니다.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">개인 피부색 분석</h3>
          <p className="card-text">
            촬영 이미지나 측정된 Lab 값이 있으면 웜/쿨 경향, 채도감, hue 방향을 정리하는 출발점으로 사용할 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}