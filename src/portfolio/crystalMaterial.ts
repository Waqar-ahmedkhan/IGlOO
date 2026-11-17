import * as THREE from 'three';
import { getCrystalBumpTexture, getCrystalRoughnessTexture } from './crystalGeometry';

export interface CrystalMaterialUniforms {
  uTime: { value: number };
  uBoost: { value: number };
  uDetailBlend: { value: number };
}

/**
 * Physical refractive faceted ice material:
 * - Real Three.js transmission + dispersion + IOR 1.36
 * - Central viewing window stays clearer while peripheral spurs & edges take on frosted relief
 * - Blue-white grazing Fresnel & crisp edge-crease luminance
 */
export function createIceCrystalMaterial(): {
  material: THREE.MeshPhysicalMaterial;
  uniforms: CrystalMaterialUniforms;
} {
  const uniforms: CrystalMaterialUniforms = {
    uTime: { value: 0 },
    uBoost: { value: 0 },
    uDetailBlend: { value: 0 },
  };

  const bumpMap = getCrystalBumpTexture();
  const roughnessMap = getCrystalRoughnessTexture();

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#DCE7F3'),
    transmission: 0.88,
    ior: 1.36,
    thickness: 2.2,
    dispersion: 4.4,
    roughness: 0.24,
    roughnessMap,
    bumpMap,
    bumpScale: 0.032,
    metalness: 0.02,
    reflectivity: 0.92,
    clearcoat: 0.78,
    clearcoatRoughness: 0.16,
    attenuationColor: new THREE.Color('#C4DCF2'),
    attenuationDistance: 2.6,
    specularIntensity: 1.0,
    specularColor: new THREE.Color('#FFFFFF'),
    flatShading: true,
    envMapIntensity: 1.35,
  });

  material.customProgramCacheKey = () => 'igloo-ice-crystal-v1';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uBoost = uniforms.uBoost;
    shader.uniforms.uDetailBlend = uniforms.uDetailBlend;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aFrost;
        attribute vec3 aBary;
        varying float vFrost;
        varying vec3 vBary;
        varying vec3 vLocalCrystalPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFrost = aFrost;
        vBary = aBary;
        vLocalCrystalPos = position;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uBoost;
        uniform float uDetailBlend;
        varying float vFrost;
        varying vec3 vBary;
        varying vec3 vLocalCrystalPos;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Keep central window facets clearer while chipped side spurs carry heavier frost
        float clearWindow = mix(0.32, 1.35, clamp(vFrost, 0.0, 1.0));
        roughnessFactor = clamp(roughnessFactor * clearWindow, 0.04, 0.78);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 cViewDir = normalize(vViewPosition);
        float cFresnel = pow(1.0 - saturate(abs(dot(normal, cViewDir))), 2.25);

        float minBary = min(vBary.x, min(vBary.y, vBary.z));
        float facetEdge = 1.0 - smoothstep(0.0, 0.048, minBary);

        // Subtle blue-white edge dispersion & icy frosted sheen
        vec3 glacialBlue = vec3(0.68, 0.87, 1.0);
        vec3 frostWhite = vec3(0.95, 0.98, 1.0);
        vec3 rimHue = mix(glacialBlue, frostWhite, cFresnel * 0.65 + vFrost * 0.35);

        float baseRim = cFresnel * (0.14 + vFrost * 0.22);
        float creaseGlow = facetEdge * (0.045 + vFrost * 0.08);
        float activeBoost = 1.0 + uBoost * 0.85 + uDetailBlend * 0.55;

        totalEmissiveRadiance += rimHue * (baseRim + creaseGlow) * activeBoost;`,
      );
  };

  return { material, uniforms };
}

/**
 * Generates high-contrast procedural PMREM environment textures for both:
 * 1. Light pale steel-grey portfolio void (crisp white softboxes + deep slate contrast panels)
 * 2. Dark blue-black detail environment (dramatic icy rim highlights)
 */
export function createCrystalEnvironmentMaps(gl: THREE.WebGLRenderer): {
  lightEnv: THREE.Texture;
  darkEnv: THREE.Texture;
  dispose: () => void;
} {
  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();

  const buildEnv = (
    bgHex: string,
    brightIntensity: number,
    cyanIntensity: number,
    darkPanelHex: string,
  ): THREE.WebGLRenderTarget => {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(bgHex);

    const addPanel = (
      color: string,
      intensity: number,
      pos: [number, number, number],
      look: [number, number, number],
      size: [number, number],
    ) => {
      const geo = new THREE.PlaneGeometry(size[0], size[1]);
      const c = new THREE.Color(color).multiplyScalar(intensity);
      const mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.lookAt(look[0], look[1], look[2]);
      studio.add(mesh);
      return { geo, mat };
    };

    const disposables = [
      // Bright overhead & upper-left softboxes for icy specular facets
      addPanel('#FFFFFF', brightIntensity, [-5, 7, 5], [0, 0, 0], [8, 4]),
      addPanel('#EAF4FF', brightIntensity * 0.85, [6, 5, 4], [0, 0, 0], [6, 5]),
      // Glacial cyan-blue rim strip
      addPanel('#9FD4FF', cyanIntensity, [7, -1, -6], [0, 0, 0], [10, 6]),
      addPanel('#CBE8FF', cyanIntensity * 0.8, [-7, 2, -6], [0, 0, 0], [8, 6]),
      // Dark slate contrast bands (crucial so refractive facets display deep glacial contrast!)
      addPanel(darkPanelHex, 1.0, [-6, -5, 2], [0, 0, 0], [10, 6]),
      addPanel(darkPanelHex, 1.0, [5, -6, 3], [0, 0, 0], [10, 6]),
      addPanel(darkPanelHex, 1.0, [0, -8, -2], [0, 0, 0], [14, 14]),
    ];

    const rt = pmrem.fromScene(studio, 0.035);
    disposables.forEach((d) => {
      d.geo.dispose();
      d.mat.dispose();
    });
    return rt;
  };

  const lightRt = buildEnv('#9CA5B4', 3.4, 2.1, '#1B2536');
  const darkRt = buildEnv('#0A1220', 4.2, 2.5, '#04070E');
  pmrem.dispose();

  return {
    lightEnv: lightRt.texture,
    darkEnv: darkRt.texture,
    dispose: () => {
      lightRt.dispose();
      darkRt.dispose();
    },
  };
}
