import { quat, vec3, type Quat, type Vec3 } from "wgpu-matrix";
import bodyShader from "@/shaders/body.wgsl";
import physicsShader from "@/shaders/physics.wgsl";
import quaternionShader from "@/shaders/quaternion.wgsl";
import type { Ray } from "./picking";

/**
 * 디버깅 스위치: true면 컴퓨트 셰이더가 계산해 CPU로 돌아온 position/rotation을
 * PHYSICS_DEBUG_INTERVAL 프레임마다 콘솔 표로 출력한다.
 */
const PHYSICS_DEBUG = false;
const PHYSICS_DEBUG_INTERVAL = 60;

const BODY_FLOATS = 20; // body.wgsl의 Body
const HOME_FLOATS = 16; // physics.wgsl의 Home
const IMPULSE_FLOATS = 16; // physics.wgsl의 Impulse
const PARAMS_SIZE = 64; // physics.wgsl의 Params
const WORKGROUP_SIZE = 4;
const READBACK_BUFFERS = 3;

export interface BodyPose {
  position: [number, number, number];
  /** 쿼터니언 xyzw */
  rotation: [number, number, number, number];
}

/** CPU로 돌아온 시뮬레이션 결과 */
export interface PhysicsResult {
  frame: number;
  bodies: BodyPose[];
}

export interface BodyDesc {
  halfExtents: readonly [number, number, number];
  position: Vec3 | number[];
  rotation: Quat | number[];
  invMass: number;
  invInertia: number;
  /** Home의 움직임을 그대로 따라가고 충돌 오프셋에만 스프링을 건다 (애니메이션이 있는 버튼용) */
  followHome?: boolean;
}

/** 강체 시뮬레이션. pass1~3을 컴퓨트 셰이더로 돌리고 결과를 CPU로 복사한다. */
export class PhysicsSim {
  /** 렌더 셰이더가 직접 읽는 강체 상태 */
  readonly bodyBuffer: GPUBuffer;
  /** 가장 최근에 CPU로 돌아온 결과 (GPU보다 1~3프레임 늦다) */
  latest: PhysicsResult | null = null;

  private readonly count: number;
  private readonly homeData: Float32Array;
  private readonly homeBuffer: GPUBuffer;
  private readonly paramsBuffer: GPUBuffer;
  private readonly paramsData = new ArrayBuffer(PARAMS_SIZE);
  private readonly bindGroup: GPUBindGroup;
  private readonly pipelines: GPUComputePipeline[];

  private readonly idleReadback: GPUBuffer[] = [];
  private pendingReadback: GPUBuffer | null = null;
  private frame = 0;
  private lastDebugFrame = 0;

  private ray: Ray | null = null;
  private rayMoved = false;
  private rayReleased = false;
  private rayPadding = 0;
  private clearRayHits = false;
  private prevRayDir: Vec3 | null = null;

  constructor(
    private device: GPUDevice,
    bodies: BodyDesc[],
  ) {
    this.count = bodies.length;
    const byteSize = (floats: number) => floats * 4 * this.count;

    const initial = new Float32Array(BODY_FLOATS * this.count);
    this.homeData = new Float32Array(HOME_FLOATS * this.count);
    bodies.forEach((body, i) => {
      const base = i * BODY_FLOATS;
      initial.set(body.position, base);
      initial[base + 3] = body.invMass;
      initial.set(body.rotation, base + 4);
      initial[base + 11] = body.invInertia;
      initial[base + 15] = body.followHome ? 1 : 0;
      initial.set(body.halfExtents, base + 16);
      this.homeData.set(body.position, i * HOME_FLOATS);
      this.homeData.set(body.rotation, i * HOME_FLOATS + 4);
    });

    this.bodyBuffer = device.createBuffer({
      label: "physics bodies",
      size: initial.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.bodyBuffer, 0, initial);
    this.homeBuffer = device.createBuffer({
      label: "physics homes",
      size: this.homeData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const impulseBuffer = device.createBuffer({
      label: "physics impulses",
      size: byteSize(IMPULSE_FLOATS),
      usage: GPUBufferUsage.STORAGE,
    });
    this.paramsBuffer = device.createBuffer({
      label: "physics params",
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    for (let i = 0; i < READBACK_BUFFERS; i++) {
      this.idleReadback.push(
        device.createBuffer({
          label: `physics readback ${i}`,
          size: initial.byteLength,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      );
    }

    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });
    this.bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.bodyBuffer } },
        { binding: 2, resource: { buffer: this.homeBuffer } },
        { binding: 3, resource: { buffer: impulseBuffer } },
      ],
    });

    const module = device.createShaderModule({
      label: "physics.wgsl",
      code: quaternionShader + bodyShader + physicsShader,
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelines = ["ray_box", "box_box", "integrate"].map((entryPoint) =>
      device.createComputePipeline({
        label: `physics ${entryPoint}`,
        layout: pipelineLayout,
        compute: { module, entryPoint },
      }),
    );
  }

  /** i번 강체가 돌아갈 자세. 직전 값과의 차이로 궤도 속도를 구한다. */
  setHome(i: number, position: Vec3 | number[], rotation: Quat | number[], dt: number) {
    const base = i * HOME_FLOATS;
    const prevPos = this.homeData.subarray(base, base + 3);
    const prevRot = this.homeData.subarray(base + 4, base + 8);
    const vel = vec3.scale(vec3.subtract(position, prevPos), 1 / dt);
    const delta = quat.mul(rotation, quat.conjugate(prevRot));
    const sign = delta[3] < 0 ? -1 : 1;
    const angVel = [delta[0], delta[1], delta[2]].map((c) => (c * sign * 2) / dt);

    this.homeData.set(vel, base + 8);
    this.homeData.set(angVel, base + 12);
    this.homeData.set(position, base);
    this.homeData.set(rotation, base + 4);
  }

  /** 포인터 광선 갱신. padding은 박스 판정을 넓히는 값(월드 단위). */
  setRay(ray: Ray, padding = 0) {
    this.ray = ray;
    this.rayMoved = true;
    this.rayReleased = false;
    this.rayPadding = padding;
  }

  /**
   * 포인터가 떠남. 다음 스텝까지는 광선을 유지해 짧은 탭도 검사되게 하고,
   * 그 뒤 닿음 상태를 지워 같은 박스를 다시 눌러도 반응하게 한다.
   */
  releaseRay() {
    this.rayReleased = true;
  }

  /** pass1~3 실행 후 결과를 readback 버퍼로 복사 */
  step(encoder: GPUCommandEncoder, dt: number) {
    this.frame++;
    this.writeParams(dt);
    this.device.queue.writeBuffer(this.homeBuffer, 0, this.homeData);

    const pass = encoder.beginComputePass({ label: "physics" });
    pass.setBindGroup(0, this.bindGroup);
    for (const pipeline of this.pipelines) {
      pass.setPipeline(pipeline);
      pass.dispatchWorkgroups(Math.ceil(this.count / WORKGROUP_SIZE));
    }
    pass.end();

    // 비어 있는 버퍼가 없으면 이번 프레임의 반환은 건너뛴다 (시뮬레이션에는 영향 없음)
    const readback = this.idleReadback.pop();
    if (readback) {
      encoder.copyBufferToBuffer(this.bodyBuffer, 0, readback, 0, readback.size);
      this.pendingReadback = readback;
    }
  }

  /** 커맨드 제출 뒤 호출: 복사가 끝나면 결과를 읽어 latest를 갱신한다 */
  readResults() {
    const buffer = this.pendingReadback;
    if (!buffer) return;
    this.pendingReadback = null;
    const frame = this.frame;
    buffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const data = new Float32Array(buffer.getMappedRange());
        const result = this.parseBodies(data, frame);
        buffer.unmap();
        this.idleReadback.push(buffer);
        if (!this.latest || frame > this.latest.frame) {
          this.latest = result;
          this.debugLog(result);
        }
      })
      .catch(() => {
        // device가 파괴되면 진행 중이던 매핑이 취소된다
      });
  }

  private writeParams(dt: number) {
    const floats = new Float32Array(this.paramsData);
    const ray = this.ray;
    if (ray) {
      floats.set(ray.origin, 0);
      floats[3] = this.rayMoved ? 1 : 0;
      floats.set(ray.dir, 4);
      floats.set(this.prevRayDir ?? ray.dir, 8);
      this.prevRayDir = ray.dir;
    } else {
      floats[3] = this.clearRayHits ? -1 : 0;
      this.clearRayHits = false;
    }
    this.rayMoved = false;
    if (this.rayReleased && ray) {
      this.ray = null;
      this.prevRayDir = null;
      this.clearRayHits = true;
    }
    this.rayReleased = false;
    floats[12] = dt;
    new Uint32Array(this.paramsData)[13] = this.count;
    floats[14] = this.rayPadding;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsData);
  }

  private parseBodies(data: Float32Array, frame: number): PhysicsResult {
    const bodies: BodyPose[] = [];
    for (let i = 0; i < this.count; i++) {
      const base = i * BODY_FLOATS;
      bodies.push({
        position: [data[base], data[base + 1], data[base + 2]],
        rotation: [data[base + 4], data[base + 5], data[base + 6], data[base + 7]],
      });
    }
    return { frame, bodies };
  }

  private debugLog(result: PhysicsResult) {
    if (!PHYSICS_DEBUG || result.frame - this.lastDebugFrame < PHYSICS_DEBUG_INTERVAL) return;
    this.lastDebugFrame = result.frame;
    console.log(`[Physics] frame ${result.frame} (0: 버튼, 1~: 토핑)`);
    console.table(
      result.bodies.map(({ position, rotation }) => ({
        px: position[0].toFixed(3),
        py: position[1].toFixed(3),
        pz: position[2].toFixed(3),
        qx: rotation[0].toFixed(3),
        qy: rotation[1].toFixed(3),
        qz: rotation[2].toFixed(3),
        qw: rotation[3].toFixed(3),
      })),
    );
  }
}
