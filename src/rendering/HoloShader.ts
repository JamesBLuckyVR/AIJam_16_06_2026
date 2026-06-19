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
  uniform vec3  uCameraPos;
  uniform float uTiltX;
  uniform float uTiltY;
  uniform float uTime;
  uniform float uHoloStrength;
  // 1.0 = art area only (Holo), 2.0 = frame only (ReverseHolo), 3.0 = everywhere (FullHolo)
  uniform float uHoloMode;
  uniform vec2  uArtMin;   // UV bottom-left of character art cutout
  uniform vec2  uArtMax;   // UV top-right of character art cutout

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  vec3 rainbow(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.333, 0.667)));
  }

  void main() {
    vec4 baseColor = texture2D(uCardTexture, vUv);
    baseColor.rgb = min(baseColor.rgb * 1.45, vec3(1.0));

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float NdotV = dot(vNormal, viewDir);

    float tiltInfluence = uTiltX * 0.4 + uTiltY * 0.3;
    float bandShift = NdotV * 0.5 + tiltInfluence + uTime * 0.04;

    float bandFreq = 48.0;
    float band = sin(vUv.y * bandFreq * 3.14159 + bandShift * 6.28318) * 0.5 + 0.5;
    band += sin(vUv.x * bandFreq * 1.5 * 3.14159 + bandShift * 4.0) * 0.25;
    band = clamp(band, 0.0, 1.0);

    vec3 holoColor = rainbow(band + bandShift);

    vec3 lightDir = normalize(vec3(1.0, 2.0, 3.0));
    vec3 halfVec  = normalize(lightDir + viewDir);
    float spec    = pow(max(dot(vNormal, halfVec), 0.0), 64.0);

    // Determine whether this pixel is inside the character art cutout.
    bool inArt = vUv.x >= uArtMin.x && vUv.x <= uArtMax.x &&
                 vUv.y >= uArtMin.y && vUv.y <= uArtMax.y;

    // Select which region gets the holo effect.
    float holoFactor;
    if (uHoloMode < 1.5) {
      // Holo: character art only
      holoFactor = inArt ? 1.0 : 0.0;
    } else if (uHoloMode < 2.5) {
      // ReverseHolo: card frame only
      holoFactor = inArt ? 0.0 : 1.0;
    } else {
      // FullHolo: entire card face
      holoFactor = 1.0;
    }

    float holoMask  = uHoloStrength * (0.18 + 0.32 * (1.0 - NdotV)) * holoFactor;
    vec3 finalColor = mix(baseColor.rgb, holoColor, holoMask) + spec * 0.25 * holoFactor;

    gl_FragColor = vec4(finalColor, baseColor.a);
  }
`;

export class HoloShader {
  readonly material: THREE.ShaderMaterial;

  constructor(
    texture: THREE.Texture,
    holoStrength = 0.28,
    holoMode = 3,
    artMin = new THREE.Vector2(0.055, 0.322),
    artMax = new THREE.Vector2(0.945, 0.888),
  ) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCardTexture:  { value: texture },
        uCameraPos:    { value: new THREE.Vector3() },
        uTiltX:        { value: 0 },
        uTiltY:        { value: 0 },
        uTime:         { value: 0 },
        uHoloStrength: { value: holoStrength },
        uHoloMode:     { value: holoMode },
        uArtMin:       { value: artMin },
        uArtMax:       { value: artMax },
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
