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
    color: new THREE.Color('#F2F8FF'),
    transmission: 0.96,
    ior: 1.24,
    thickness: 0.78,
    dispersion: 2.2,
    roughness: 0.055,
    roughnessMap,
    bumpMap,
    bumpScale: 0.012,
    metalness: 0.01,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color('#DCF0FF'),
    attenuationDistance: 4.0,
    specularIntensity: 1.0,
    specularColor: new THREE.Color('#FFFFFF'),
    flatShading: true,
    envMapIntensity: 1.85,
  });

  material.customProgramCacheKey = () => 'igloo-ice-crystal-glass-v3';

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
        // Crystal-clear optical glass center window with lightly frosted outer bevels
        float clearWindow = mix(0.16, 0.85, clamp(vFrost, 0.0, 1.0));
        roughnessFactor = clamp(roughnessFactor * clearWindow, 0.02, 0.45);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 cViewDir = normalize(vViewPosition);
        float cFresnel = pow(1.0 - saturate(abs(dot(normal, cViewDir))), 2.55);

        float minBary = min(vBary.x, min(vBary.y, vBary.z));
        float facetEdge = 1.0 - smoothstep(0.0, 0.042, minBary);

        // Crisp refractive glass edge highlights & prismatic frost sheen
        vec3 glacialBlue = vec3(0.74, 0.90, 1.0);
        vec3 frostWhite = vec3(0.97, 0.99, 1.0);
        vec3 rimHue = mix(glacialBlue, frostWhite, cFresnel * 0.72 + vFrost * 0.28);

        float baseRim = cFresnel * (0.22 + vFrost * 0.24);
        float creaseGlow = facetEdge * (0.065 + vFrost * 0.11);
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
