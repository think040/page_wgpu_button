// 강체 한 개의 상태. 레이아웃을 바꾸면 PhysicsSim.ts의 BODY_FLOATS도 함께 수정한다.

struct Body {
  // xyz: 위치, w: 역질량 (0이면 물리에 밀리지 않는 고정 충돌체)
  pos : vec4f,
  quat : vec4f,
  // xyz: 선속도, w: 역관성 (박스를 구처럼 근사한 스칼라 값)
  linVel : vec4f,
  // xyz: 각속도
  angVel : vec4f,
  // xyz: 절반 크기
  half_size : vec4f,
};
