// Viewmodel studio lighting (docs/PREMIUM_WEAPONS.md §1.5.6).
// Every first-person material gets an explicit `envMap`: a studio environment (RoomEnvironment through
// PMREM) whose `envMapRotation.y` turns by -0.5 x the camera's yaw change, so chrome / gold reflections slide
// across the gun 1.5x faster than the world when the player turns (the CSO "reflections move" look).
// The map's own IBL is still applied (a second cube-UV lookup in the same pass, no extra render): the studio
// adds 0.5 x the scene's ambient colour around each normal, floored so metal still reads in dark maps.
// Inspect raises the studio term 1.0 -> 1.35 (fill light). No extra passes, ~4 texture fetches per pixel.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setFinishQuality } from './finishes.js';

export const vmEnv = {
  studio: null,                       // PMREM texture: material.envMap of every viewmodel material
  rotation: new THREE.Euler(),        // shared material.envMapRotation (one object for all vm materials)
  u: {
    vmSceneEnv: { value: null },      // the map's PMREM environment (second lookup)
    vmsTexel: { value: new THREE.Vector2(1, 1) },
    vmsMaxMip: { value: 0 },
    vmSceneI: { value: 0 },
    vmSceneRot: { value: new THREE.Matrix3() },
    vmStudioI: { value: 1 },          // inspect fill: 1 -> 1.35
    vmStudioNorm: { value: 1.6 },     // 1 / average studio irradiance (RoomEnvironment, measured)
    vmStudioFloor: { value: 0.07 },   // studio share kept in dark maps
  },
  lastYaw: null,
  boost: 0,
  sceneEnv: undefined,
};
if (typeof window !== 'undefined') (window.__gfx ||= {}).vmEnv = vmEnv;   // dev QA handle

/** Builds the studio environment once per renderer (call before creating viewmodel materials). */
export function initVmEnv(gl) {
  if (vmEnv.studio) return vmEnv.studio;
  // glitter cells (~1,800 across a rifle) break down in mediump fragment precision (§3.2.1 #6)
  if (gl.capabilities?.precision && gl.capabilities.precision !== 'highp') setFinishQuality({ glitter: false });
  const pm = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  vmEnv.studio = pm.fromScene(room, 0.04).texture;
  room.dispose?.();
  pm.dispose();
  vmEnv.u.vmSceneEnv.value = vmEnv.studio;
  return vmEnv.studio;
}

const _d = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

/** Per frame: yaw-driven reflection slide, inspect fill, scene IBL binding. inspect = 0..1. */
export function updateVmEnv(dt, { camera, scene, inspect = 0 }) {
  // reflections slide 1.5x the turn: env rotation follows -0.5 x the accumulated (unwrapped) yaw change
  camera.getWorldDirection(_d);
  const yaw = Math.atan2(-_d.x, -_d.z);
  if (vmEnv.lastYaw !== null) {
    let dy = yaw - vmEnv.lastYaw;
    dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
    vmEnv.rotation.y = (vmEnv.rotation.y - 0.5 * dy) % (Math.PI * 2);
  }
  vmEnv.lastYaw = yaw;
  vmEnv.boost += (inspect - vmEnv.boost) * (1 - Math.exp(-6 * dt));
  vmEnv.u.vmStudioI.value = 1 + 0.35 * vmEnv.boost;
  const env = scene?.environment || null;
  const u = vmEnv.u;
  if (env !== vmEnv.sceneEnv) {
    vmEnv.sceneEnv = env;
    const ok = env && env.mapping === THREE.CubeUVReflectionMapping && env.image?.height;
    u.vmSceneEnv.value = ok ? env : vmEnv.studio;
    if (ok) {
      // same constants three derives for its own CUBEUV_* defines (WebGLProgram generateCubeUVSize)
      const h = env.image.height, maxMip = Math.log2(h) - 2;
      u.vmsMaxMip.value = maxMip;
      u.vmsTexel.value.set(1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16)), 1 / h);
    }
    vmEnv.sceneOk = !!ok;
  }
  u.vmSceneI.value = vmEnv.sceneOk ? (scene.environmentIntensity ?? 1) : 0;
  if (scene) u.vmSceneRot.value.setFromMatrix4(_m4.makeRotationFromEuler(scene.environmentRotation)).transpose();
}

// three's cube-UV sampler, renamed and driven by uniforms so the map's PMREM (any size) can be read next to
// the studio map that owns the CUBEUV_* defines of the program
const CUBE = THREE.ShaderChunk.cube_uv_reflection_fragment;
const cubeBody = CUBE.slice(CUBE.indexOf('#ifdef ENVMAP_TYPE_CUBE_UV') + '#ifdef ENVMAP_TYPE_CUBE_UV'.length, CUBE.lastIndexOf('#endif'))
  .replace(/cubeUV_/g, 'vmsUV_')
  .replace(/\bgetFace\b/g, 'vmsGetFace').replace(/\bgetUV\b/g, 'vmsGetUV').replace(/\bbilinearCubeUV\b/g, 'vmsBilinear')
  .replace(/\broughnessToMip\b/g, 'vmsRoughToMip').replace(/\btextureCubeUV\b/g, 'vmsTextureCubeUV')
  .replace(/CUBEUV_TEXEL_WIDTH/g, 'vmsTexel.x').replace(/CUBEUV_TEXEL_HEIGHT/g, 'vmsTexel.y').replace(/CUBEUV_MAX_MIP/g, 'vmsMaxMip');

export const VMENV_PARS = /* glsl */`
#ifdef VM_ENV
uniform sampler2D vmSceneEnv;
uniform vec2 vmsTexel;
uniform float vmsMaxMip, vmSceneI, vmStudioI, vmStudioNorm, vmStudioFloor;
uniform mat3 vmSceneRot;
${cubeBody}
#endif
`;

/** After lights_fragment_maps: studio (material envMap, already in iblIrradiance / radiance) x scene tint + scene IBL. */
export const VMENV_LIGHT = /* glsl */`
#ifdef VM_ENV
{
  vec3 wn = inverseTransformDirection(geometryNormal, viewMatrix);
  vec3 rv = reflect(-geometryViewDir, geometryNormal);
  rv = inverseTransformDirection(normalize(mix(rv, geometryNormal, pow4(material.roughness))), viewMatrix);
  vec3 sIrr = vec3(0.0), sRad = vec3(0.0);
  if (vmSceneI > 0.0) {
    sIrr = vmsTextureCubeUV(vmSceneEnv, vmSceneRot * wn, 1.0).rgb * vmSceneI;
    sRad = vmsTextureCubeUV(vmSceneEnv, vmSceneRot * rv, material.roughness).rgb * vmSceneI;
  }
  vec3 tint = max(sIrr * 0.5 * vmStudioNorm, vec3(vmStudioFloor)) * vmStudioI;
  iblIrradiance = iblIrradiance * tint + PI * sIrr * envMapIntensity;
  radiance = radiance * tint + sRad * envMapIntensity;
}
#endif
`;
