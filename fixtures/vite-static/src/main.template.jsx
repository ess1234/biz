// JSX 안의 정적 <img> 도 빌드 때 alt 가 들어간다 (React 없이 문자열로만 검사하는 픽스처)
const html = `
  <img src="{{IMG}}/i/{{ID3}}" class="card" />
  <img src="{{IMG}}/i/{{ID3}}" alt="" />
`;
document.getElementById('app').innerHTML = html;
