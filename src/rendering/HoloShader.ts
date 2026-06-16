import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uCardTexture;
  uniform vec3 uCameraPos;
  uniform float uTiltX;
  uniform float uTiltY;
  uniform float uTime;
  uniform float uHoloStrength;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.333, 0.667)));
  }

  void main() {
    vec4 baseColor = texture2D(uCardTexture, vUv);

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float NdotV = dot(vNormal, viewDir);

    float tiltInfluence = uTiltX * 0.4 + uTiltY * 0.3;
    float bandShift = NdotV * 0.5 + tiltInfluence + uTime * 0.04;

    float bandFreq = 10.0;
    float band = sin(vUv.y * bandFreq * 3.14159 + bandShift * 6.28318) * 0.5 + 0.5;
    band += sin(vUv.x * bandFreq * 1.5 * 3.14159 + bandShift * 4.0) * 0.25;
    band = clamp(band, 0.0, 1.0);

    vec3 holoColor = rainbow(band + bandShift);

    vec3 lightDir = normalize(vec3(1.0, 2.0, 3.0));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfVec), 0.0), 48.0);

    float holoMask = uHoloStrength * (0.5 + 0.5 * (1.0 - NdotV));
    vec3 finalColor = mix(baseColor.rgb, holoColor, holoMask) + spec * 0.7;

    gl_FragColor = vec4(finalColor, baseColor.a);
  }
`;

export class HoloShader {
  readonly material: THREE.ShaderMaterial;

  constructor(texture: THREE.Texture, holoStrength = 0.5) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCardTexture: { value: texture },
        uCameraPos:   { value: new THREE.Vector3() },
        uTiltX:       { value: 0 },
        uTiltY:       { value: 0 },
        uTime:        { value: 0 },
        uHoloStrength:{ value: holoStrength },
      },
      side: THREE.FrontSide,
    });
  }

  updateTilt(x: number, y: number): void {
    this.material.uniforms['uTiltX'].value = x;
    this.material.uniforms['uTiltY'].value = y;
  }

  updateTime(t: number): void {
    this.material.uniforms['uTime'].value = t;
  }

  updateCamera(pos: THREE.Vector3): void {
    (this.material.uniforms['uCameraPos'].value as THREE.Vector3).copy(pos);
  }

  setTexture(texture: THREE.Texture): void {
    this.material.uniforms['uCardTexture'].value = texture;
  }

  dispose(): void {
    this.material.dispose();
  }
}
