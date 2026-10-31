// 장면 공용 정의 (button.wgsl, floor.wgsl): 카메라/조명 + 그림자 샘플링

struct Scene {
  viewProj : mat4x4f,
  cameraPos : vec4f,
  lightDir : vec4f,
  // x: time, y: clip(반사 패스에서 1), z: width, w: height
  params : vec4f,
  lightViewProj : mat4x4f,
};

@group(0) @binding(0) var<uniform> scene : Scene;
@group(0) @binding(2) var shadowMap : texture_depth_2d;
@group(0) @binding(3) var shadowSampler : sampler_comparison;

const SHADOW_DEPTH_BIAS : f32 = 0.0008;

// 월드 좌표 p가 빛을 받는 정도 (0: 그림자, 1: 빛). 3x3 PCF로 경계를 부드럽게 한다.
fn shadow_factor(p : vec3f) -> f32 {
  let clip = scene.lightViewProj * vec4f(p, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = ndc.xy * vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || ndc.z > 1.0) {
    return 1.0; // 그림자 맵 범위 밖
  }

  let texel = 1.5 / vec2f(textureDimensions(shadowMap));
  var lit = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, ndc.z - SHADOW_DEPTH_BIAS);
    }
  }
  return lit / 9.0;
}
