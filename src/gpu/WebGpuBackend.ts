import { GAME_H, GAME_W, type IGpuBackend, type SkyGradient } from './GpuTypes';

export const FLOATS_PER_INSTANCE = 16;
export const MAX_INSTANCES_PER_PASS = 8192;

const WGSL_CODE = /* wgsl */ `
struct SkyUniforms {
  topColor: vec4f,
  bottomColor: vec4f,
  params: vec4f, // x: timeSec, y: cozyFilter (1 or 0), z: viewW, w: viewH
};

@group(0) @binding(0) var<uniform> uSky: SkyUniforms;
@group(0) @binding(1) var uAtlas: texture_2d<f32>;
@group(0) @binding(2) var uSamp: sampler;

struct SkyOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vsSky(@builtin(vertex_index) vid: u32) -> SkyOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  var p = corners[vid];
  var out: SkyOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@fragment
fn fsSky(in: SkyOut) -> @location(0) vec4f {
  var col = mix(uSky.topColor.rgb, uSky.bottomColor.rgb, clamp(in.uv.y, 0.0, 1.0));
  if (uSky.params.y > 0.5) {
    let gridY = 0.985 + 0.015 * sin(in.uv.y * 180.0 * 6.28318);
    col *= gridY;
  }
  return vec4f(col, 1.0);
}

struct InstanceIn {
  @location(0) rectPosSize: vec4f, // x, y, w, h
  @location(1) uvBounds: vec4f,    // u0, v0, u1, v1
  @location(2) tint: vec4f,        // r, g, b, a
  @location(3) extra: vec4f,       // x: rot, y: mode (0 sprite, 1 light, 2 solid), z: flash, w: param
};

struct SpriteOut {
  @builtin(position) pos: vec4f,
  @location(0) texUv: vec2f,
  @location(1) localUv: vec2f,
  @location(2) tint: vec4f,
  @location(3) mode: f32,
  @location(4) flash: f32,
  @location(5) param: f32,
};

@vertex
fn vsSprite(@builtin(vertex_index) vid: u32, inst: InstanceIn) -> SpriteOut {
  var quad = array<vec2f, 6>(
    vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5),
    vec2f(-0.5, 0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5)
  );
  var uvUnit = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let q = quad[vid];
  let u01 = uvUnit[vid];
  let c = cos(inst.extra.x);
  let s = sin(inst.extra.x);

  let scaled = q * inst.rectPosSize.zw;
  let rotated = vec2f(
    scaled.x * c - scaled.y * s,
    scaled.x * s + scaled.y * c
  );
  let world = inst.rectPosSize.xy + rotated;

  let ndcX = (world.x / ${GAME_W}.0) * 2.0 - 1.0;
  let ndcY = 1.0 - (world.y / ${GAME_H}.0) * 2.0;

  var out: SpriteOut;
  out.pos = vec4f(ndcX, ndcY, 0.0, 1.0);
  out.texUv = mix(inst.uvBounds.xy, inst.uvBounds.zw, u01);
  out.localUv = u01;
  out.tint = inst.tint;
  out.mode = inst.extra.y;
  out.flash = inst.extra.z;
  out.param = inst.extra.w;
  return out;
}

@fragment
fn fsSprite(in: SpriteOut) -> @location(0) vec4f {
  // Sample atlas in uniform control flow BEFORE any non-uniform mode branches (WGSL requirement)
  let sampled = textureSample(uAtlas, uSamp, in.texUv);

  if (in.mode > 1.5) {
    // Mode 2: Solid crisp pixel shape with optional flash
    let solidRgb = mix(in.tint.rgb, vec3f(1.0), clamp(in.flash, 0.0, 1.0));
    return vec4f(solidRgb, in.tint.a);
  }
  if (in.mode > 0.5) {
    // Mode 1: Smooth radial GPU light / bloom orb (guard pow base > 0)
    let d = length(in.localUv * 2.0 - vec2f(1.0));
    let falloff = clamp(1.0 - d, 0.0, 1.0);
    let power = select(2.0, in.param, in.param > 0.1);
    let glow = select(0.0, pow(max(falloff, 0.0001), power), falloff > 0.001);
    return vec4f(in.tint.rgb, in.tint.a * glow);
  }
  // Mode 0: Crisp nearest-sampled Texture Atlas sprite with per-instance hit-flash
  if (sampled.a < 0.05) {
    discard;
  }
  let baseRgb = sampled.rgb * in.tint.rgb;
  let finalRgb = mix(baseRgb, vec3f(1.0), clamp(in.flash, 0.0, 1.0));
  return vec4f(finalRgb, sampled.a * in.tint.a);
}
`;

export class WebGpuBackend implements IGpuBackend {
  public readonly kind = 'webgpu' as const;

  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private skyPipeline: GPURenderPipeline;
  private alphaPipeline: GPURenderPipeline;
  private addPipeline: GPURenderPipeline;
  private skyUniformBuffer: GPUBuffer;
  private skyUniformData = new Float32Array(12);
  private alphaBuffer: GPUBuffer;
  private addBuffer: GPUBuffer;
  private atlasTexture: GPUTexture;
  private bindGroup: GPUBindGroup;
  private onLostCallback?: () => void;
  private recovered = false;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    skyPipeline: GPURenderPipeline,
    alphaPipeline: GPURenderPipeline,
    addPipeline: GPURenderPipeline,
    skyUniformBuffer: GPUBuffer,
    alphaBuffer: GPUBuffer,
    addBuffer: GPUBuffer,
    atlasTexture: GPUTexture,
    bindGroup: GPUBindGroup,
    onLost?: () => void,
  ) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.skyPipeline = skyPipeline;
    this.alphaPipeline = alphaPipeline;
    this.addPipeline = addPipeline;
    this.skyUniformBuffer = skyUniformBuffer;
    this.alphaBuffer = alphaBuffer;
    this.addBuffer = addBuffer;
    this.atlasTexture = atlasTexture;
    this.bindGroup = bindGroup;
    this.onLostCallback = onLost;

    void device.lost.then(() => {
      if (!this.recovered) {
        this.recovered = true;
        this.onLostCallback?.();
      }
    });
  }

  public static async tryCreate(
    canvas: HTMLCanvasElement,
    atlasWidth: number,
    atlasHeight: number,
    initialPixels: Uint8Array,
    onLost?: () => void,
  ): Promise<WebGpuBackend | null> {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    try {
      const adapter =
        (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
        (await navigator.gpu.requestAdapter());
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      device.pushErrorScope('validation');
      const module = device.createShaderModule({ code: WGSL_CODE });
      const info = await module.getCompilationInfo();
      if (info.messages.some((m) => m.type === 'error')) {
        await device.popErrorScope();
        device.destroy();
        return null;
      }

      const atlasTexture = device.createTexture({
        size: [atlasWidth, atlasHeight, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      const copy = new Uint8Array(initialPixels);
      device.queue.writeTexture(
        { texture: atlasTexture },
        copy,
        { bytesPerRow: atlasWidth * 4, rowsPerImage: atlasHeight },
        { width: atlasWidth, height: atlasHeight },
      );

      const sampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      const skyUniformBuffer = device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const instanceBytes = MAX_INSTANCES_PER_PASS * FLOATS_PER_INSTANCE * 4;
      const alphaBuffer = device.createBuffer({
        size: instanceBytes,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      const addBuffer = device.createBuffer({
        size: instanceBytes,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: skyUniformBuffer } },
          { binding: 1, resource: atlasTexture.createView() },
          { binding: 2, resource: sampler },
        ],
      });

      const instanceLayout: GPUVertexBufferLayout = {
        arrayStride: FLOATS_PER_INSTANCE * 4,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x4' },
          { shaderLocation: 1, offset: 16, format: 'float32x4' },
          { shaderLocation: 2, offset: 32, format: 'float32x4' },
          { shaderLocation: 3, offset: 48, format: 'float32x4' },
        ],
      };

      const [skyPipeline, alphaPipeline, addPipeline] = await Promise.all([
        device.createRenderPipelineAsync({
          layout: pipelineLayout,
          vertex: { module, entryPoint: 'vsSky' },
          fragment: { module, entryPoint: 'fsSky', targets: [{ format }] },
        }),
        device.createRenderPipelineAsync({
          layout: pipelineLayout,
          vertex: { module, entryPoint: 'vsSprite', buffers: [instanceLayout] },
          fragment: {
            module,
            entryPoint: 'fsSprite',
            targets: [
              {
                format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
        }),
        device.createRenderPipelineAsync({
          layout: pipelineLayout,
          vertex: { module, entryPoint: 'vsSprite', buffers: [instanceLayout] },
          fragment: {
            module,
            entryPoint: 'fsSprite',
            targets: [
              {
                format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                },
              },
            ],
          },
        }),
      ]);

      const validationErr = await device.popErrorScope();
      if (validationErr) {
        device.destroy();
        return null;
      }

      // Only bind the canvas to 'webgpu' once shaders & pipelines are 100% verified,
      // keeping the canvas untouched for WebGL2 if WebGPU pipeline creation fails.
      const context = canvas.getContext('webgpu');
      if (!context) {
        device.destroy();
        return null;
      }
      context.configure({ device, format, alphaMode: 'opaque' });

      const backend = new WebGpuBackend(
        device,
        context,
        format,
        skyPipeline,
        alphaPipeline,
        addPipeline,
        skyUniformBuffer,
        alphaBuffer,
        addBuffer,
        atlasTexture,
        bindGroup,
        onLost,
      );
      device.addEventListener('uncapturederror', () => {
        if (!backend.recovered) {
          backend.recovered = true;
          backend.onLostCallback?.();
        }
      });
      return backend;
    } catch {
      return null;
    }
  }

  public uploadAtlas(width: number, height: number, pixels: Uint8Array): void {
    const copy = new Uint8Array(pixels);
    this.device.queue.writeTexture(
      { texture: this.atlasTexture },
      copy,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height },
    );
  }

  public resize(_pixelWidth: number, _pixelHeight: number): void {
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });
  }

  public renderFrame(
    sky: SkyGradient,
    alphaItems: Float32Array,
    alphaCount: number,
    additiveItems: Float32Array,
    additiveCount: number,
    timeSec: number,
  ): number {
    this.skyUniformData[0] = sky.top[0];
    this.skyUniformData[1] = sky.top[1];
    this.skyUniformData[2] = sky.top[2];
    this.skyUniformData[3] = 1;
    this.skyUniformData[4] = sky.bottom[0];
    this.skyUniformData[5] = sky.bottom[1];
    this.skyUniformData[6] = sky.bottom[2];
    this.skyUniformData[7] = 1;
    this.skyUniformData[8] = timeSec;
    this.skyUniformData[9] = sky.cozyFilter ? 1 : 0;
    this.skyUniformData[10] = GAME_W;
    this.skyUniformData[11] = GAME_H;
    this.device.queue.writeBuffer(this.skyUniformBuffer, 0, this.skyUniformData);

    const safeAlpha = Math.min(alphaCount, MAX_INSTANCES_PER_PASS);
    const safeAdd = Math.min(additiveCount, MAX_INSTANCES_PER_PASS);

    if (safeAlpha > 0) {
      this.device.queue.writeBuffer(
        this.alphaBuffer,
        0,
        alphaItems.buffer,
        alphaItems.byteOffset,
        safeAlpha * FLOATS_PER_INSTANCE * 4,
      );
    }
    if (safeAdd > 0) {
      this.device.queue.writeBuffer(
        this.addBuffer,
        0,
        additiveItems.buffer,
        additiveItems.byteOffset,
        safeAdd * FLOATS_PER_INSTANCE * 4,
      );
    }

    let view: GPUTextureView;
    try {
      view = this.context.getCurrentTexture().createView();
    } catch {
      if (!this.recovered) {
        this.recovered = true;
        this.onLostCallback?.();
      }
      return 0;
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: sky.top[0], g: sky.top[1], b: sky.top[2], a: 1 },
        },
      ],
    });

    let drawCalls = 1;
    pass.setBindGroup(0, this.bindGroup);
    pass.setPipeline(this.skyPipeline);
    pass.draw(6);

    if (safeAlpha > 0) {
      pass.setPipeline(this.alphaPipeline);
      pass.setVertexBuffer(0, this.alphaBuffer);
      pass.draw(6, safeAlpha);
      drawCalls++;
    }

    if (safeAdd > 0) {
      pass.setPipeline(this.addPipeline);
      pass.setVertexBuffer(0, this.addBuffer);
      pass.draw(6, safeAdd);
      drawCalls++;
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return drawCalls;
  }

  public dispose(): void {
    this.alphaBuffer.destroy();
    this.addBuffer.destroy();
    this.skyUniformBuffer.destroy();
    this.atlasTexture.destroy();
    this.device.destroy();
  }
}
