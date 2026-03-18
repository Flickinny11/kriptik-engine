precision mediump float;

attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
uniform float uTime;
uniform float uHover;
uniform float uActivity; // 0=idle, 1=streaming new content

varying vec2 vTextureCoord;
varying vec2 vVertexPosition;

void main() {
  vec3 pos = aVertexPosition;

  // Subtle wave displacement when content is streaming
  float wave = sin(pos.x * 4.0 + uTime * 2.0) * 0.003 * uActivity;
  wave += cos(pos.y * 3.0 + uTime * 1.5) * 0.002 * uActivity;
  pos.z += wave;

  // Hover lift — box rises slightly toward camera
  pos.z += uHover * 0.02;

  gl_Position = uPMatrix * uMVMatrix * vec4(pos, 1.0);
  vTextureCoord = aTextureCoord;
  vVertexPosition = pos.xy;
}
