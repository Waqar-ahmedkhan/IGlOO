import * as THREE from 'three';
import { buildIceBlocks } from '../src/loop/iglooLayout.ts';
import { computeTimings, createBlockState, evaluateBlock } from '../src/loop/choreography.ts';
const blocks = buildIceBlocks(); const a = createBlockState(); const prev = new THREE.Vector3();
console.log('n', blocks.length);
const res=[];
blocks.forEach((b,i)=>{ const t=computeTimings(b); evaluateBlock(b,t,0,a); prev.copy(a.pos); let m=0,mp=0;
for(let k=1;k<=7200;k++){ evaluateBlock(b,t,k/7200,a); const s=a.pos.distanceTo(prev)*120; if(s>m){m=s;mp=k/7200;} prev.copy(a.pos);} res.push([i,b.row,m.toFixed(2),mp.toFixed(4)]);});
res.sort((x,y)=>y[2]-x[2]); console.log(res.slice(0,10));
