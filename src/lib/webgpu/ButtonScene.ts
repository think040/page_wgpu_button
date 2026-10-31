import { mat4, quat, vec3, type Mat4 } from "wgpu-matrix";
import bodyShader from "@/shaders/body.wgsl";
import buttonShader from "@/shaders/button.wgsl";
import floorShader from "@/shaders/floor.wgsl";
import objectShader from "@/shaders/object.wgsl";
import quaternionShader from "@/shaders/quaternion.wgsl";
import sceneShader from "@/shaders/scene.wgsl";
import shadowShader from "@/shaders/shadow.wgsl";
import { createPlane, createRoundedBox, type Mesh } from "./geometry";
import { PhysicsSim, type BodyDesc } from "./PhysicsSim";
import { rayIntersectMesh, screenToRay } from "./picking";

const SAMPLE_COUNT = 4;
const SCENE_UNIFORM_SIZE = 176; // mat4 + vec4 * 3 + mat4
const OBJECT_UNIFORM_SIZE = 176; // mat4 * 2 + vec4 * 3
const BG: GPUColor = { r: 0.067, g: 0.035, b: 0.027, a: 1 };

/** 버튼 크기 (절반 값) 와 모서리 반지름 */
const BUTTON_HALF: [number, number, number] = [1.6, 0.5, 0.26];
const BUTTON_RADIUS = 0.22;
const BUTTON_Y = 0.85;

/** 토핑 큐브 */
const TOPPING_COLORS = ["#f5c542", "#3f8f3a", "#e0452b", "#2b2320", "#e8d6b5"];
const TOPPING_HALF = 0.2;
const TOPPING_INV_MASS = 1;
const TOPPING_INV_INERTIA = 6;

/** 그림자 */
const SHADOW_MAP_SIZE = 2048;
const SHADOW_FORMAT: GPUTextureFormat = "depth32float";
const LIGHT_DIR = vec3.normalize([-0.4, -1, -0.6]);

interface GpuMesh {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
}

interface SceneObject {
  mesh: GpuMesh;
  uniform: GPUBuffer;
  bindGroup: GPUBindGroup;
  data: Float32Array;
}

export interface ButtonSceneOptions {
  /** 버튼이 눌리고 애니메이션이 끝난 뒤 호출 */
  onActivate: () => void;
  /** 커서 모양 갱신용 (hover 여부) */
  onHoverChange?: (hover: boolean) => void;
}

/** sRGB hex → 선형 RGB */
function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)) as [
    number,
    number,
    number,
  ];
}

/** 임계 감쇠 스프링 (값, 속도) 을 목표로 이동 */
function spring(state: { x: number; v: number }, target: number, k: number, damping: number, dt: number) {
  const a = (target - state.x) * k - state.v * damping;
  state.v += a * dt;
  state.x += state.v * dt;
}

/** 토핑이 돌아갈 궤도 위의 자세. 속도가 조금씩 달라 서로 앞지르며 부딪힌다. */
function toppingHome(i: number, t: number) {
  const a = t * (0.3 + i * 0.05) + (i / TOPPING_COLORS.length) * Math.PI * 2;
  const r = 2.7 + Math.sin(t * 0.5 + i) * 0.15;
  // 버튼 뒤쪽을 지나는 타원 궤도 (버튼을 가리지 않도록)
  const position = [
    Math.cos(a) * r,
    0.6 + i * 0.12 + Math.sin(t * 1.3 + i) * 0.15,
    Math.sin(a) * 0.9 - 1.5,
  ];
  const rotation = quat.mul(
    quat.fromAxisAngle([0, 1, 0], t * (0.8 + i * 0.1)),
    quat.fromAxisAngle([1, 0, 0], t * 0.6 + i),
  );
  return { position, rotation };
}

export class ButtonScene {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private buttonPipeline!: GPURenderPipeline;
  private buttonReflectPipeline!: GPURenderPipeline;
  private floorPipeline!: GPURenderPipeline;
  private shadowPipeline!: GPURenderPipeline;

  private sceneLayout!: GPUBindGroupLayout;
  private objectLayout!: GPUBindGroupLayout;
  private floorLayout!: GPUBindGroupLayout;
  private shadowSceneLayout!: GPUBindGroupLayout;

  private sceneBuffer!: GPUBuffer;
  private reflectSceneBuffer!: GPUBuffer;
  private sceneBindGroup!: GPUBindGroup;
  private reflectSceneBindGroup!: GPUBindGroup;
  private floorBindGroup!: GPUBindGroup;
  private shadowSceneBindGroup!: GPUBindGroup;
  private sampler!: GPUSampler;

  private physics!: PhysicsSim;
  private shadowTexture!: GPUTexture;
  private lightViewProj: Mat4 = mat4.identity();

  private floorMesh!: GpuMesh;
  private button!: SceneObject;
  private decor: SceneObject[] = [];
  private buttonMesh: Mesh = createRoundedBox(...BUTTON_HALF, BUTTON_RADIUS, 10);

  private msaaTexture?: GPUTexture;
  private depthTexture?: GPUTexture;
  private reflectionTexture?: GPUTexture;
  private reflectionDepth?: GPUTexture;

  private width = 1;
  private height = 1;
  private viewProj: Mat4 = mat4.identity();
  private buttonModel: Mat4 = mat4.identity();
  /** 눌림/기울기를 뺀 기본 자세 (모서리를 누르다 메시가 밀려나도 판정이 끊기지 않도록) */
  private buttonRestModel: Mat4 = mat4.identity();

  private raf = 0;
  private lastTime = 0;
  private time = 0;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;

  // ── 인터랙션 상태 ──
  private pointer = { x: 0, y: 0 }; // -1..1 (패럴랙스용)
  private hover = false;
  private pressing = false;
  private pressPointerId = -1;
  private activating = false;
  private activateTime = 0;
  private press = { x: 0, v: 0 };
  private tilt = { x: 0, v: 0 };
  private glow = { x: 0, v: 0 };
  private parallaxX = { x: 0, v: 0 };
  private parallaxY = { x: 0, v: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private options: ButtonSceneOptions,
  ) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "gpu" in navigator;
  }

  async init(): Promise<void> {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU adapter를 찾을 수 없습니다.");
    this.device = await adapter.requestDevice();
    this.device.addEventListener("uncapturederror", (e) =>
      console.error("[WebGPU]", (e as GPUUncapturedErrorEvent).error.message),
    );
    if (this.destroyed) return;

    this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });

    this.createPhysics();
    this.createLayoutsAndPipelines();
    await this.createSceneObjects();
    if (this.destroyed) return;

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.attachInput();

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.detachInput();
    this.device?.destroy();
  }

  // ───────────────────────── 파이프라인 ─────────────────────────

  /** bodies[0]은 버튼(고정 충돌체), 그 뒤로 토핑 큐브 */
  private createPhysics() {
    const bodies: BodyDesc[] = [
      {
        halfExtents: BUTTON_HALF,
        position: [0, BUTTON_Y, 0],
        rotation: quat.identity(),
        invMass: 0,
        invInertia: 0,
      },
      ...TOPPING_COLORS.map((_, i) => ({
        halfExtents: [TOPPING_HALF, TOPPING_HALF, TOPPING_HALF] as const,
        ...toppingHome(i, 0),
        invMass: TOPPING_INV_MASS,
        invInertia: TOPPING_INV_INERTIA,
      })),
    ];
    this.physics = new PhysicsSim(this.device, bodies);
  }

  private createLayoutsAndPipelines() {
    const d = this.device;
    this.sceneLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    this.shadowSceneLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    this.objectLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.floorLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const vertexLayout: GPUVertexBufferLayout = {
      arrayStride: 24,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x3" },
      ],
    };

    const objectCommon = quaternionShader + bodyShader + objectShader;
    const buttonModule = d.createShaderModule({
      label: "button.wgsl",
      code: objectCommon + sceneShader + buttonShader,
    });
    const floorModule = d.createShaderModule({
      label: "floor.wgsl",
      code: sceneShader + floorShader,
    });
    const shadowModule = d.createShaderModule({
      label: "shadow.wgsl",
      code: objectCommon + shadowShader,
    });

    const buttonLayout = d.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.objectLayout],
    });

    const makeButtonPipeline = (cullMode: GPUCullMode, sampleCount: number) =>
      d.createRenderPipeline({
        layout: buttonLayout,
        vertex: { module: buttonModule, entryPoint: "vs_main", buffers: [vertexLayout] },
        fragment: { module: buttonModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list", cullMode },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
        multisample: { count: sampleCount },
      });

    this.buttonPipeline = makeButtonPipeline("back", SAMPLE_COUNT);
    // 거울 변환은 삼각형 감김 방향을 뒤집으므로 앞면을 컬링
    this.buttonReflectPipeline = makeButtonPipeline("front", 1);

    this.floorPipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout, this.floorLayout] }),
      vertex: { module: floorModule, entryPoint: "vs_main", buffers: [vertexLayout] },
      fragment: { module: floorModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      multisample: { count: SAMPLE_COUNT },
    });

    this.shadowPipeline = d.createRenderPipeline({
      layout: d.createPipelineLayout({
        bindGroupLayouts: [this.shadowSceneLayout, this.objectLayout],
      }),
      vertex: { module: shadowModule, entryPoint: "vs_main", buffers: [vertexLayout] },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: SHADOW_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "less",
        depthBias: 2,
        depthBiasSlopeScale: 2,
      },
    });

    this.sampler = d.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.sceneBuffer = d.createBuffer({ size: SCENE_UNIFORM_SIZE, usage });
    this.reflectSceneBuffer = d.createBuffer({ size: SCENE_UNIFORM_SIZE, usage });

    // 그림자 맵은 광원이 고정이라 크기와 행렬이 바뀌지 않는다
    this.shadowTexture = d.createTexture({
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
      format: SHADOW_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const shadowSampler = d.createSampler({
      compare: "less",
      magFilter: "linear",
      minFilter: "linear",
    });
    const shadowView = this.shadowTexture.createView();
    const bodies = { buffer: this.physics.bodyBuffer };
    const makeSceneBindGroup = (buffer: GPUBuffer) =>
      d.createBindGroup({
        layout: this.sceneLayout,
        entries: [
          { binding: 0, resource: { buffer } },
          { binding: 1, resource: bodies },
          { binding: 2, resource: shadowView },
          { binding: 3, resource: shadowSampler },
        ],
      });
    this.sceneBindGroup = makeSceneBindGroup(this.sceneBuffer);
    this.reflectSceneBindGroup = makeSceneBindGroup(this.reflectSceneBuffer);

    // 토핑 궤도와 버튼을 모두 담는 직교 투영
    const center = [0, 0.6, -0.7];
    const lightEye = vec3.add(center, vec3.scale(LIGHT_DIR, -10));
    this.lightViewProj = mat4.multiply(
      mat4.ortho(-5, 5, -4.5, 4.5, 0.1, 20),
      mat4.lookAt(lightEye, center, [0, 1, 0]),
    );
    const lightBuffer = d.createBuffer({ size: 64, usage });
    d.queue.writeBuffer(lightBuffer, 0, this.lightViewProj);
    this.shadowSceneBindGroup = d.createBindGroup({
      layout: this.shadowSceneLayout,
      entries: [
        { binding: 0, resource: { buffer: lightBuffer } },
        { binding: 1, resource: bodies },
      ],
    });
  }

  private uploadMesh(mesh: Mesh): GpuMesh {
    const vertexBuffer = this.device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    const indexBuffer = this.device.createBuffer({
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(indexBuffer, 0, mesh.indices);
    return { vertexBuffer, indexBuffer, indexCount: mesh.indices.length };
  }

  private createObject(
    mesh: GpuMesh,
    texture: GPUTexture,
    color: string,
    params: number[],
    bodyIndex = -1,
  ): SceneObject {
    const uniform = this.device.createBuffer({
      size: OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const data = new Float32Array(OBJECT_UNIFORM_SIZE / 4);
    data.set([...linear(color), 1], 32);
    data.set(params, 36);
    data[40] = bodyIndex;
    this.device.queue.writeBuffer(uniform, 0, data);
    const bindGroup = this.device.createBindGroup({
      layout: this.objectLayout,
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });
    return { mesh, uniform, bindGroup, data };
  }

  /** 버튼 앞면에 들어갈 텍스트를 2D 캔버스로 그려 텍스처로 만든다 */
  private async createLabelTexture(): Promise<GPUTexture> {
    await document.fonts?.ready;
    const w = 1024;
    const h = Math.round((w * BUTTON_HALF[1]) / BUTTON_HALF[0]);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, w, h);

    // 안쪽 테두리
    g.strokeStyle = "rgba(255, 228, 190, 0.55)";
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(46, 34, w - 92, h - 68, 60);
    g.stroke();

    g.fillStyle = "#fff3dc";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "800 112px 'Black Han Sans', 'Noto Sans KR', sans-serif";
    g.fillText("지금 문의하기 →", w / 2, h * 0.44);
    g.font = "700 34px 'Noto Sans KR', sans-serif";
    g.fillStyle = "rgba(255, 220, 170, 0.85)";
    g.fillText("CATERING · PARTY · GROUP ORDER", w / 2, h * 0.76);

    const texture = this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: c }, { texture }, [w, h]);
    return texture;
  }

  private async createSceneObjects() {
    this.floorMesh = this.uploadMesh(createPlane());

    const labelTexture = await this.createLabelTexture();
    const dummy = this.device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.button = this.createObject(this.uploadMesh(this.buttonMesh), labelTexture, "#d2381c", [
      1,
      0,
      BUTTON_HALF[0],
      BUTTON_HALF[1],
    ]);

    // 버튼 주변을 떠다니는 토핑 큐브들 (치즈, 바질, 토마토, 올리브, 버섯)
    const cube = this.uploadMesh(createRoundedBox(TOPPING_HALF, TOPPING_HALF, TOPPING_HALF, 0.08, 5));
    TOPPING_COLORS.forEach((color, i) => {
      this.decor.push(this.createObject(cube, dummy, color, [0, 0, 1, 1], i + 1));
    });
  }

  // ───────────────────────── 리사이즈 ─────────────────────────

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height && this.depthTexture) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;

    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();
    this.reflectionTexture?.destroy();
    this.reflectionDepth?.destroy();

    const d = this.device;
    this.msaaTexture = d.createTexture({
      size: [w, h],
      format: this.format,
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTexture = d.createTexture({
      size: [w, h],
      format: "depth24plus",
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.reflectionTexture = d.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.reflectionDepth = d.createTexture({
      size: [w, h],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.floorBindGroup = d.createBindGroup({
      layout: this.floorLayout,
      entries: [
        { binding: 0, resource: this.reflectionTexture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  // ───────────────────────── 입력 (ray-mesh picking) ─────────────────────────

  /** 포인터 위치에서 광선을 쏴 버튼 메시와 실제로 교차하는지 검사 */
  private hitTest(e: PointerEvent): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const ray = screenToRay(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      this.viewProj,
    );
    return (
      rayIntersectMesh(ray, this.buttonMesh, this.buttonModel) !== null ||
      (this.pressing && rayIntersectMesh(ray, this.buttonMesh, this.buttonRestModel) !== null)
    );
  }

  private setHover(h: boolean) {
    if (h !== this.hover) {
      this.hover = h;
      this.options.onHoverChange?.(h);
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.activating) return;
    if (!this.hitTest(e)) return;
    // 누른 순간 버튼 메시에 닿아야 "누르는 중" 상태가 된다
    this.pressing = true;
    this.pressPointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.setHover(true);
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.pointer.x = (x / rect.width) * 2 - 1;
    this.pointer.y = (y / rect.height) * 2 - 1;
    this.physics.setRay(screenToRay(x, y, rect.width, rect.height, this.viewProj));
    if (this.activating) return;
    this.setHover(this.hitTest(e));
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pressing || e.pointerId !== this.pressPointerId) return;
    this.pressing = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    // 뗄 때도 광선이 버튼 메시에 닿아 있어야 이벤트 발생 (A 방식)
    if (this.hitTest(e)) {
      this.activating = true;
      this.activateTime = this.time;
      if (navigator.vibrate) navigator.vibrate(15);
    } else {
      this.setHover(false);
    }
    if (e.pointerType !== "mouse") this.setHover(false);
  };

  private onPointerCancel = () => {
    this.pressing = false;
    this.setHover(false);
  };

  private onPointerLeave = () => {
    this.pointer.x = 0;
    this.pointer.y = 0;
    this.physics.setRay(null);
    if (!this.pressing) this.setHover(false);
  };

  private attachInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerCancel);
    c.addEventListener("pointerleave", this.onPointerLeave);
  }

  private detachInput() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerCancel);
    c.removeEventListener("pointerleave", this.onPointerLeave);
  }

  // ───────────────────────── 애니메이션 / 렌더 ─────────────────────────

  private static readonly ACTIVATE_DURATION = 0.75;
  private activated = false;

  private update(dt: number) {
    const t = this.time;

    // 눌림 깊이 & 기울기 (위아래 회전)
    let tiltTarget = 0;
    let pressTarget = 0;
    if (this.pressing) {
      pressTarget = 1;
      tiltTarget = -0.32; // 윗면이 뒤로 젖혀짐
    }
    spring(this.press, pressTarget, 260, 18, dt);
    spring(this.tilt, tiltTarget, 180, 10, dt);
    spring(this.glow, this.hover || this.pressing ? 1 : 0, 120, 16, dt);
    spring(this.parallaxX, this.pointer.x, 30, 10, dt);
    spring(this.parallaxY, this.pointer.y, 30, 10, dt);

    let wobble = 0;
    let lift = 0;
    if (this.activating) {
      // 활성화: 위아래로 흔들리며 회전한 뒤 이벤트 발생
      const k = t - this.activateTime;
      wobble = Math.sin(k * 16) * Math.exp(-k * 4.5) * 0.45;
      lift = Math.sin(Math.min(k / ButtonScene.ACTIVATE_DURATION, 1) * Math.PI) * 0.25;
      if (k >= ButtonScene.ACTIVATE_DURATION && !this.activated) {
        this.activated = true;
        this.options.onActivate();
      }
    }

    const bob = Math.sin(t * 1.6) * 0.05;
    const rest = mat4.translation([0, BUTTON_Y + bob, 0]);
    mat4.rotateY(rest, this.parallaxX.x * 0.22 + Math.sin(t * 0.7) * 0.05, rest);
    this.buttonRestModel = rest;

    const m = mat4.translation([0, BUTTON_Y + bob + lift, -this.press.x * 0.3]);
    mat4.rotateY(m, this.parallaxX.x * 0.22 + Math.sin(t * 0.7) * 0.05, m);
    mat4.rotateX(m, this.tilt.x + wobble + this.parallaxY.x * 0.12, m);
    const s = 1 - this.press.x * 0.05;
    mat4.scale(m, [s, s, s], m);
    this.buttonModel = m;
    this.writeObject(this.button, m, this.glow.x);

    // 강체가 돌아갈 자세: 버튼은 현재 자세 그대로, 토핑은 궤도 위치
    const buttonRotation = quat.mul(
      quat.fromAxisAngle([0, 1, 0], this.parallaxX.x * 0.22 + Math.sin(t * 0.7) * 0.05),
      quat.fromAxisAngle([1, 0, 0], this.tilt.x + wobble + this.parallaxY.x * 0.12),
    );
    this.physics.setHome(0, mat4.getTranslation(m), buttonRotation, dt);
    this.decor.forEach((_, i) => {
      const { position, rotation } = toppingHome(i, t);
      this.physics.setHome(i + 1, position, rotation, dt);
    });
  }

  private writeObject(obj: SceneObject, model: Mat4, glow: number) {
    obj.data.set(model, 0);
    obj.data.set(mat4.transpose(mat4.inverse(model)), 16);
    obj.data[37] = glow;
    this.device.queue.writeBuffer(obj.uniform, 0, obj.data);
  }

  private writeScene(buffer: GPUBuffer, viewProj: Mat4, eye: number[], clip: number) {
    const data = new Float32Array(SCENE_UNIFORM_SIZE / 4);
    data.set(viewProj, 0);
    data.set([eye[0], eye[1], eye[2], 1], 16);
    data.set([LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2], 0], 20);
    data.set([this.time, clip, this.width, this.height], 24);
    data.set(this.lightViewProj, 28);
    this.device.queue.writeBuffer(buffer, 0, data);
  }

  private frame = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;
    if (dt <= 0) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.time += dt;

    // 카메라: 버튼 폭(여백 포함 약 4.6)이 화면 가로에 들어오도록 거리 조절 (모바일 세로 화면 대응)
    const aspect = this.width / this.height;
    const fovY = (38 * Math.PI) / 180;
    const dist = Math.max(6.4, 2.3 / (Math.tan(fovY / 2) * aspect));
    const eye = [0, 1.45 + (dist - 6.4) * 0.12, dist];
    const proj = mat4.perspective(fovY, aspect, 0.1, 100);
    const view = mat4.lookAt(eye, [0, 0.35, 0], [0, 1, 0]);
    this.viewProj = mat4.multiply(proj, view);

    // 평면(y=0) 반사 행렬: y 축 반전
    const reflectViewProj = mat4.multiply(this.viewProj, mat4.scaling([1, -1, 1]));

    this.update(dt);
    this.writeScene(this.sceneBuffer, this.viewProj, eye, 0);
    this.writeScene(this.reflectSceneBuffer, reflectViewProj, eye, 1);

    const encoder = this.device.createCommandEncoder();

    // 1) 강체 시뮬레이션 (ray-box → box-box → 적분)
    this.physics.step(encoder, dt);

    // 2) 그림자 패스: 광원 시점의 깊이를 매 프레임 새로 렌더링
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    shadowPass.setPipeline(this.shadowPipeline);
    shadowPass.setBindGroup(0, this.shadowSceneBindGroup);
    this.drawObjects(shadowPass);
    shadowPass.end();

    // 3) 반사 패스: 거울에 비친 장면을 텍스처로
    const reflectPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.reflectionTexture!.createView(),
          clearValue: BG,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.reflectionDepth!.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    reflectPass.setPipeline(this.buttonReflectPipeline);
    reflectPass.setBindGroup(0, this.reflectSceneBindGroup);
    this.drawObjects(reflectPass);
    reflectPass.end();

    // 4) 메인 패스: 바닥(반사 텍스처 샘플링) + 오브젝트
    const mainPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.msaaTexture!.createView(),
          resolveTarget: this.context.getCurrentTexture().createView(),
          clearValue: BG,
          loadOp: "clear",
          storeOp: "discard",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture!.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "discard",
      },
    });
    mainPass.setPipeline(this.floorPipeline);
    mainPass.setBindGroup(0, this.sceneBindGroup);
    mainPass.setBindGroup(1, this.floorBindGroup);
    mainPass.setVertexBuffer(0, this.floorMesh.vertexBuffer);
    mainPass.setIndexBuffer(this.floorMesh.indexBuffer, "uint32");
    mainPass.drawIndexed(this.floorMesh.indexCount);

    mainPass.setPipeline(this.buttonPipeline);
    mainPass.setBindGroup(0, this.sceneBindGroup);
    this.drawObjects(mainPass);
    mainPass.end();

    this.device.queue.submit([encoder.finish()]);
    this.physics.readResults();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawObjects(pass: GPURenderPassEncoder) {
    for (const obj of [this.button, ...this.decor]) {
      pass.setBindGroup(1, obj.bindGroup);
      pass.setVertexBuffer(0, obj.mesh.vertexBuffer);
      pass.setIndexBuffer(obj.mesh.indexBuffer, "uint32");
      pass.drawIndexed(obj.mesh.indexCount);
    }
  }
}
