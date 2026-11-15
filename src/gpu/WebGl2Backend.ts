import {
  FLOATS_PER_INSTANCE,
  GAME_H,
  GAME_W,
  MAX_INSTANCES_PER_PASS,
  type IGpuBackend,
  type SkyGradient,
} from './GpuTypes';

const SKY_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corners[6] = vec2[6](
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
  );
  vec2 p = corners[gl_VertexID];
  vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uCozyFilter;
out vec4 fragColor;
void main() {
  vec3 col = mix(uTopColor, uBottomColor, clamp(vUv.y, 0.0, 1.0));
  if (uCozyFilter > 0.5) {
    col *= 0.985 + 0.015 * sin(vUv.y * 180.0 * 6.28318);
  }
  fragColor = vec4(col, 1.0);
}`;

const SPRITE_VS = `#version 300 es
layout(location = 0) in vec4 aRectPosSize;
layout(location = 1) in vec4 aUvBounds;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aExtra;

out vec2 vTexUv;
out vec2 vLocalUv;
out vec4 vTint;
out float vMode;
out float vFlash;
out float vParam;

void main() {
  vec2 quad[6] = vec2[6](
    vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(-0.5, 0.5),
    vec2(-0.5, 0.5), vec2(0.5, -0.5), vec2(0.5, 0.5)
  );
  vec2 uvUnit[6] = vec2[6](
    vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
    vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
  );
  vec2 q = quad[gl_VertexID];
  vec2 u01 = uvUnit[gl_VertexID];
  float c = cos(aExtra.x);
  float s = sin(aExtra.x);
  vec2 scaled = q * aRectPosSize.zw;
  vec2 rotated = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
  vec2 world = aRectPosSize.xy + rotated;

  float ndcX = (world.x / ${GAME_W}.0) * 2.0 - 1.0;
  float ndcY = 1.0 - (world.y / ${GAME_H}.0) * 2.0;

  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  vTexUv = mix(aUvBounds.xy, aUvBounds.zw, u01);
  vLocalUv = u01;
  vTint = aTint;
  vMode = aExtra.y;
  vFlash = aExtra.z;
  vParam = aExtra.w;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vTexUv;
in vec2 vLocalUv;
in vec4 vTint;
in float vMode;
in float vFlash;
in float vParam;
uniform sampler2D uAtlas;
out vec4 fragColor;
void main() {
  if (vMode > 1.5) {
    vec3 solidRgb = mix(vTint.rgb, vec3(1.0), clamp(vFlash, 0.0, 1.0));
    fragColor = vec4(solidRgb, vTint.a);
    return;
  }
  if (vMode > 0.5) {
    float d = length(vLocalUv * 2.0 - vec2(1.0));
    float f = clamp(1.0 - d, 0.0, 1.0);
    float power = vParam > 0.1 ? vParam : 2.0;
    float glow = f > 0.001 ? pow(f, power) : 0.0;
    fragColor = vec4(vTint.rgb, vTint.a * glow);
    return;
  }
  vec4 sampled = texture(uAtlas, vTexUv);
  if (sampled.a < 0.05) discard;
  vec3 baseRgb = sampled.rgb * vTint.rgb;
  vec3 finalRgb = mix(baseRgb, vec3(1.0), clamp(vFlash, 0.0, 1.0));
  fragColor = vec4(finalRgb, sampled.a * vTint.a);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('Unable to create WebGL shader');
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'Shader compile error';
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('Unable to create WebGL program');
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'Program link error';
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  return prog;
}

export class WebGl2Backend implements IGpuBackend {
  public readonly kind = 'webgl2' as const;

  private gl: WebGL2RenderingContext;
  private skyProg: WebGLProgram;
  private spriteProg: WebGLProgram;
  private skyVao: WebGLVertexArrayObject;
  private spriteVao: WebGLVertexArrayObject;
  private instanceBuffer: WebGLBuffer;
  private atlasTexture: WebGLTexture;
  private uTopLoc: WebGLUniformLocation | null;
  private uBottomLoc: WebGLUniformLocation | null;
  private uCozyLoc: WebGLUniformLocation | null;

  private constructor(
    gl: WebGL2RenderingContext,
    atlasWidth: number,
    atlasHeight: number,
    initialPixels: Uint8Array,
  ) {
    this.gl = gl;
    this.skyProg = linkProgram(gl, SKY_VS, SKY_FS);
    this.spriteProg = linkProgram(gl, SPRITE_VS, SPRITE_FS);

    this.uTopLoc = gl.getUniformLocation(this.skyProg, 'uTopColor');
    this.uBottomLoc = gl.getUniformLocation(this.skyProg, 'uBottomColor');
    this.uCozyLoc = gl.getUniformLocation(this.skyProg, 'uCozyFilter');

    gl.useProgram(this.spriteProg);
    const uAtlasLoc = gl.getUniformLocation(this.spriteProg, 'uAtlas');
    if (uAtlasLoc) gl.uniform1i(uAtlasLoc, 0);

    this.skyVao = gl.createVertexArray()!;
    this.spriteVao = gl.createVertexArray()!;
    this.instanceBuffer = gl.createBuffer()!;
    this.atlasTexture = gl.createTexture()!;

    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES_PER_PASS * FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4;
    for (let loc = 0; loc < 4; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, loc * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploadAtlas(atlasWidth, atlasHeight, initialPixels);
  }

  public static tryCreate(
    canvas: HTMLCanvasElement,
    atlasWidth: number,
    atlasHeight: number,
    initialPixels: Uint8Array,
  ): WebGl2Backend | null {
    try {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) return null;
      return new WebGl2Backend(gl, atlasWidth, atlasHeight, initialPixels);
    } catch {
      return null;
    }
  }

  public uploadAtlas(width: number, height: number, pixels: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  }

  public resize(_pixelWidth: number, _pixelHeight: number): void {
    // Viewport updated cleanly each frame via canvas dimensions
  }

  public renderFrame(
    sky: SkyGradient,
    alphaItems: Float32Array,
    alphaCount: number,
    additiveItems: Float32Array,
    additiveCount: number,
    _timeSec: number,
  ): number {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    let drawCalls = 1;
    gl.disable(gl.BLEND);
    gl.useProgram(this.skyProg);
    gl.bindVertexArray(this.skyVao);
    gl.uniform3f(this.uTopLoc, sky.top[0], sky.top[1], sky.top[2]);
    gl.uniform3f(this.uBottomLoc, sky.bottom[0], sky.bottom[1], sky.bottom[2]);
    gl.uniform1f(this.uCozyLoc, sky.cozyFilter ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(this.spriteProg);
    gl.bindVertexArray(this.spriteVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

    const safeAlpha = Math.min(alphaCount, MAX_INSTANCES_PER_PASS);
    const safeAdd = Math.min(additiveCount, MAX_INSTANCES_PER_PASS);

    if (safeAlpha > 0) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, alphaItems.subarray(0, safeAlpha * FLOATS_PER_INSTANCE));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, safeAlpha);
      drawCalls++;
    }

    if (safeAdd > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, additiveItems.subarray(0, safeAdd * FLOATS_PER_INSTANCE));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, safeAdd);
      drawCalls++;
    }

    return drawCalls;
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteTexture(this.atlasTexture);
    gl.deleteVertexArray(this.skyVao);
    gl.deleteVertexArray(this.spriteVao);
    gl.deleteProgram(this.skyProg);
    gl.deleteProgram(this.spriteProg);
  }
}
