// 그림자 맵 패스: 광원 시점의 깊이만 기록한다 (프래그먼트 셰이더 없음)
// 그림자 맵을 그리는 동안 샘플링 바인딩이 묶이면 안 되므로 scene.wgsl과 별도 레이아웃을 쓴다.

@group(0) @binding(0) var<uniform> lightViewProj : mat4x4f;

@vertex
fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {
  return lightViewProj * vec4f(object_world_pos(position), 1.0);
}
