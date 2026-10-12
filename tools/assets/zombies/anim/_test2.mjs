import path from 'node:path';
import { Skeleton, REPO } from './skeleton.mjs';
import { ual1, ual2, cmu, MAP_UE, MAP_CMU } from './sources.mjs';
import { retarget } from './retarget.mjs';
import { makeClip, fixSigns } from './clip.mjs';
import { GLBBuilder, addSkeleton, addClips } from './glb-write.mjs';
const skel = new Skeleton();
const clips = [];
for (const a of ['Zombie_Scratch', 'Hit_Knockback', 'Consume', 'LayToIdle', 'ClimbUp_1m_RM', 'OverhandThrow', 'NinjaJump_Start', 'NinjaJump_Land', 'Melee_Hook', 'Idle_No_Loop', 'Zombie_Idle_Loop', 'Shield_Dash_RM'])
  clips.push(makeClip('u2_' + a, retarget(ual2(a), MAP_UE, skel, { finger3: true })));
for (const a of ['Death01', 'Hit_Chest', 'Hit_Head', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Start', 'Punch_Cross', 'Roll', 'Walk_Loop', 'Idle_Loop'])
  clips.push(makeClip('u1_' + a, retarget(ual1(a), MAP_UE, skel, { finger3: true })));
for (const t of ['90_16', '90_18', '140_01', '140_03', '111_03', '133_01', '104_13', '91_16', '77_19', '111_06', '77_16', '91_24', '104_03', '20_08', '21_08'])
  clips.push(makeClip('c_' + t, retarget(cmu(t), MAP_CMU, skel, {})));
for (const c of clips) { fixSigns(c); }
const g = new GLBBuilder();
const ids = addSkeleton(g, skel);
addClips(g, skel, ids, clips);
g.json.scenes[0].extras = { clips: {} };
console.log('bytes', g.write(path.join(REPO, 'game', 'dev', 'test_src.glb')));
for (const c of clips) console.log(c.name, ((c.poses.length - 1) / 30).toFixed(2));
