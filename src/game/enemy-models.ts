import * as THREE from 'three';
import type { Boss, Enemy } from '../core/model';
import { BODY_HEIGHT } from '../core/fps-geometry';
import { ENEMY_ATTACK } from '../core/enemy-balance';
import { SCALE } from './world-space';
import { bevel, box, material, orb, ring } from './scene-primitives';

export function figure(kind: Enemy['kind'] | Boss['kind']) {
  const g = new THREE.Group();
  if (kind === 'rat') {
    const body = orb(g, 0.36, 0, 0.32, 0, 0x8b9481); body.scale.set(1, 0.72, 1.35);
    const head = orb(g, 0.23, 0, 0.37, 0.38, 0xa6ae92); head.scale.set(0.82, 0.8, 1.15);
    orb(g, 0.09, -0.15, 0.58, 0.31, 0x9a9e87); orb(g, 0.09, 0.15, 0.58, 0.31, 0x9a9e87);
    orb(g, 0.035, -0.12, 0.42, 0.54, 0xf4b570, 0xa84917); orb(g, 0.035, 0.12, 0.42, 0.54, 0xf4b570, 0xa84917);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.2, -0.35), new THREE.Vector3(0.08, 0.12, -0.7), new THREE.Vector3(-0.1, 0.1, -1.02),
    ]), 12, 0.035, 6, false), material(0x9d9185)); g.add(tail);
    orb(g, 0.055, 0, 0.36, 0.65, 0x3a3032);
    for (const sign of [-1, 1]) orb(g, 0.055, sign * 0.15, 0.59, 0.34, 0xc1a3a0);
    let foot = 0;
    for (const x of [-0.2, 0.2]) for (const z of [-0.22, 0.22]) {
      const leg = bevel(g, 0.11, 0.13, 0.18, x, 0.12, z, 0x59655c); leg.name = `foot-${foot++}`;
    }
  } else if (kind === 'readerstatue') {
    bevel(g, .8, .25, .8, 0, .125, 0, 0x756877);
    bevel(g, .64, .09, .65, 0, .295, 0, 0xb9a089, true);
    const robe = new THREE.Mesh(new THREE.ConeGeometry(.34, 1.5, 12), material(0x726579));
    robe.position.y = 1.03; robe.castShadow = true; g.add(robe);
    bevel(g, .53, .72, .4, 0, 1.4, .03, 0x897a8e);
    const hood = orb(g, .28, 0, 2.08, 0, 0x8c8192); hood.scale.set(1.05, 1.12, .9);
    bevel(g, .31, .25, .06, 0, 2.03, .255, 0x49404f);
    for (const sign of [-1, 1]) {
      orb(g, .025, sign * .08, 2.08, .295, 0xf6bbda, 0x733c67);
      const arm = bevel(g, .18, .58, .22, sign * .35, 1.45, .19, 0x968598); arm.rotation.x = -.35;
      bevel(g, .14, .11, .19, sign * .23, 1.31, .43, 0xb0a1ac);
      bevel(g, .03, 1.04, .035, sign * .15, 1.02, .3, 0xc2a482, true);
    }
    const book = new THREE.Group(); book.name = 'reader-book'; book.position.set(0, 1.36, .46); book.rotation.x = .36; g.add(book);
    bevel(book, .58, .06, .38, 0, 0, 0, 0x433649, true);
    for (const sign of [-1, 1]) {
      const page = bevel(book, .255, .025, .34, sign * .135, .05, 0, 0xd3c2a9); page.rotation.z = sign * .15;
      for (let line = 0; line < 4; line++) bevel(book, .15, .008, .012, sign * .135, .075, -.1 + line * .055, 0x69566a);
    }
    bevel(book, .035, .07, .38, 0, .025, 0, 0x9c7d8f, true);
    const focus = orb(g, .095, 0, ENEMY_ATTACK.readerstatue.beamHeight * SCALE, .53, 0xffa6d1, 0x843758);
    focus.name = 'reader-focus';
  } else if (kind === 'chainhound') {
    const body = bevel(g, .55, .47, 1.02, 0, .53, -.22, 0x554753); body.name = 'chain-hound-body';
    bevel(g, .62, .5, .43, 0, .58, .29, 0x756375, true);
    bevel(g, .43, .36, .46, 0, .79, .64, 0x675664);
    bevel(g, .35, .2, .42, 0, .73, .94, 0x413943);
    bevel(g, .27, .09, .06, 0, .77, 1.16, 0x24242b, true);
    const jaw = new THREE.Group(); jaw.name = 'hound-jaw'; jaw.position.set(0, .64, .76); g.add(jaw);
    bevel(jaw, .36, .08, .45, 0, 0, .17, 0x9e8c81, true);
    for (const sign of [-1, 1]) {
      orb(g, .035, sign * .19, .88, .85, 0xffbe8b, 0x843b29);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(.085, .23, 6), material(0x8d7882));
      ear.position.set(sign * .19, 1.005, .61); ear.rotation.z = sign * -.2; ear.castShadow = true; g.add(ear);
      for (const z of [.2, .35]) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(.027, .085, 6), material(0xe3ccb1));
        fang.position.set(sign * .13, .07, z); jaw.add(fang);
      }
      for (let link = 0; link < 5; link++) {
        const chain = new THREE.Mesh(new THREE.TorusGeometry(.058, .016, 6, 12), material(0xbca58e));
        chain.position.set(sign * .29, .59, -.44 + link * .15); chain.rotation.x = link % 2 * Math.PI / 2; g.add(chain);
      }
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.29, .047, 8, 24), material(0xb09a83));
    collar.name = 'hound-collar'; collar.position.set(0, .61, .39); g.add(collar);
    for (const z of [-.55, -.26, .03]) bevel(g, .55, .075, .24, 0, .8, z, 0x92818a, true);
    let foot = 0;
    for (const x of [-.23, .23]) for (const z of [-.52, .4]) {
      const leg = new THREE.Group(); leg.name = `foot-${foot++}`; leg.position.set(x, .41, z); g.add(leg);
      bevel(leg, .15, .28, .17, 0, -.12, 0, 0x665560);
      bevel(leg, .2, .13, .29, 0, -.33, .045, 0xa39081, true);
    }
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .59, -.73), new THREE.Vector3(.04, .72, -1.08), new THREE.Vector3(-.08, .86, -1.28),
    ]), 10, .04, 6, false), material(0xa18c83)); g.add(tail);
  } else if (kind === 'relicheart') {
    bevel(g,1.3,.4,1.3,0,.2,0,0x5c405a,true);
    const core=orb(g,.64,0,1.82,0,0xf196ac,0xa33b64);core.scale.set(.82,1.6,.82);core.name='heart-core';
    for(let i=0;i<3;i++) {
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(.91,.055,8,48),material(0xcba3c8,0x603951));
      orbit.position.y=1.82;orbit.rotation.set(i*Math.PI/3,Math.PI/4+i*Math.PI/3,0);orbit.name=`heart-orbit-${i}`;g.add(orbit);
    }
    for(const sign of [-1,1]) {
      const crown=orb(g,.18,0,1.82+sign*1.35,0,0xe1c293,0x885434);crown.scale.set(.6,1.8,.6);
      bevel(g,.06,.7,.06,0,1.82+sign*.9,0,0xd9b791,true);
    }
    ring(g,.8,0xd598be);
  } else if (kind === 'sealcaster') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(.36, 1.35, 18), material(0x6b5549));
    robe.position.y = .78; robe.castShadow = true; g.add(robe);
    const hood = orb(g, .26, 0, 1.71, 0, 0x95816b); hood.scale.set(1.1, 1.08, .96);
    bevel(g, .27, .25, .065, 0, 1.7, .24, 0x302c35);
    for (const sign of [-1, 1]) {
      orb(g, .029, sign * .07, 1.76, .285, 0xffd595, 0x8d5027);
      bevel(g, .18, .47, .18, sign * .36, 1.13, .13, 0x9b8065);
      bevel(g, .15, .18, .24, sign * .17, .12, .04, 0x534b4a);
      bevel(g, .035, .95, .03, sign * .15, .88, .265, 0xd1b38d, true);
    }
    const tablet = new THREE.Group(); tablet.name = 'seal-tablet'; tablet.position.set(0, 1.18, .4); g.add(tablet);
    bevel(tablet, .46, .34, .085, 0, 0, 0, 0x433b4a, true);
    for (const sign of [-1, 1]) {
      bevel(tablet, .46, .025, .02, 0, sign * .145, .06, 0xd0b386, true);
      bevel(tablet, .08, .15, .12, sign * .25, -.04, -.04, 0xb3a087);
    }
    const seal = ring(tablet, .1, 0xffcc88); seal.rotation.x = 0; seal.position.set(0, 0, .06);
    bevel(tablet, .02, .12, .025, 0, 0, .07, 0xffd19b, 0x8a4b25);
    const focus = ring(g, .19, 0xffc98a); focus.name = 'seal-focus'; focus.rotation.x = 0; focus.position.set(0, 1.53, .38);
  } else if (kind === 'riftshaman') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(.36, 1.35, 18), material(0x53425f));
    robe.position.y = .78; robe.castShadow = true; g.add(robe);
    const hood = orb(g, .25, 0, 1.69, 0, 0x83698c); hood.scale.set(1.1, 1.12, .95);
    bevel(g, .28, .23, .07, 0, 1.7, .235, 0x292636);
    for (const sign of [-1, 1]) {
      orb(g, .03, sign * .075, 1.75, .28, 0xe3bdff, 0x794da8);
      bevel(g, .17, .48, .18, sign * .38, 1.15, .08, 0x83698c);
      bevel(g, .15, .19, .22, sign * .18, .12, .03, 0x423849);
      bevel(g, .045, .9, .025, sign * .17, .85, .25, 0xbab0bb, true);
    }
    const staff = new THREE.Group(); staff.name = 'rift-staff'; staff.position.set(.43, 1.02, .17); g.add(staff);
    bevel(staff, .065, 1.52, .065, 0, .03, 0, 0xc3a6c1, true);
    orb(staff, .14, 0, .84, 0, 0xd3a4f1, 0x75449c);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(.23, .035, 8, 24), material(0xbdb0cc));
    crown.position.y = .84; staff.add(crown);
    bevel(g, .1, .14, .11, .43, 1.03, .17, 0xbda5c3);
  } else if (kind === 'voidknight') {
    bevel(g, .64, .75, .44, 0, 1.3, 0, 0x30354e, true);
    bevel(g, .48, .46, .43, 0, 2.05, 0, 0x58516f, true);
    bevel(g, .36, .06, .035, 0, 2.08, .235, 0x9aebef, 0x326e86);
    bevel(g, .06, .62, .045, 0, 1.3, .255, 0xaf9bd1, 0x483166);
    for (const sign of [-1, 1]) {
      const leg = bevel(g, .2, .65, .25, sign * .18, .43, 0, 0x33354a, true); leg.name = `leg-${sign}`;
      bevel(g, .23, .16, .36, sign * .18, .11, .09, 0x66627a, true);
      bevel(g, .3, .24, .36, sign * .43, 1.68, 0, 0x7b6c92, true);
      bevel(g, .17, .48, .19, sign * .43, 1.31, .08, 0x464056, true);
      bevel(g, .065, .5, .035, sign * .23, 1.29, .26, 0xa894c9, true);
    }
    const sword = new THREE.Group(); sword.name = 'void-sword'; sword.position.set(.44, 1.1, .2); g.add(sword);
    bevel(sword, .09, .3, .09, 0, .07, 0, 0x423647);
    bevel(sword, .42, .07, .12, 0, .23, 0, 0xb5a1d3, true);
    bevel(sword, .18, 1.15, .07, 0, .84, 0, 0x9292ad, true);
    bevel(sword, .04, 1.09, .08, 0, .84, .018, 0xc3f0ed, 0x356a8c);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.1, .21, 4), material(0x9292ad));
    tip.position.y = 1.52; tip.castShadow = true; sword.add(tip);
  } else if (kind === 'heartguard') {
    bevel(g, .62, .72, .42, 0, 1.25, 0, 0x6d4654, true);
    bevel(g, .47, .42, .4, 0, 1.99, 0, 0x997789, true);
    bevel(g, .36, .075, .035, 0, 2.03, .225, 0xf1abb6, 0x9c3e59);
    orb(g, .1, 0, 1.3, .245, 0xef8ca2, 0x923d5a);
    for (const sign of [-1, 1]) {
      const leg = bevel(g, .19, .61, .24, sign * .18, .42, 0, 0x4f4657, true); leg.name = `leg-${sign}`;
      bevel(g, .23, .16, .36, sign * .18, .11, .09, 0x8d7c83, true);
      bevel(g, .27, .18, .35, sign * .41, 1.61, 0, 0xb39888, true);
      bevel(g, .15, .48, .17, sign * .42, 1.3, .08, 0x755b69, true);
      bevel(g, .065, .57, .035, sign * .22, 1.25, .24, 0xd1b295, true);
    }
    const sword = new THREE.Group(); sword.name = 'guardian-sword'; sword.position.set(.43, 1.06, .18); g.add(sword);
    bevel(sword, .12, .13, .13, 0, 0, 0, 0xc4a18d);
    bevel(sword, .07, .28, .07, 0, .12, 0, 0x493746);
    bevel(sword, .38, .065, .09, 0, .28, 0, 0xc6ae91, true);
    bevel(sword, .16, 1.13, .055, 0, .87, 0, 0xcfb8c6, true);
    bevel(sword, .035, 1.08, .065, 0, .86, .012, 0xf5b5c4, 0x87324f);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.085, .2, 4), material(0xcfb8c6));
    tip.position.y = 1.53; tip.castShadow = true; sword.add(tip);
  } else if (kind === 'watcher') {
    bevel(g,.52,1.0,.52,0,.5,0,0x546576,true);orb(g,.32,0,1.55,0,0x9fd9dc,0x346d94);
    const orbit=new THREE.Mesh(new THREE.TorusGeometry(.37,.035,8,32),material(0xd1af89));orbit.position.y=1.55;orbit.rotation.x=Math.PI/2;g.add(orbit);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;orb(g,.06,Math.cos(a)*.4,1.55,Math.sin(a)*.4,0xf0c891,0x856134);}
    bevel(g,.18,.42,.18,0,1.99,0,0x8e8799,true);
  } else if (kind === 'chainpriest') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.86, 2.6, 20), material(0x55415e));
    robe.position.y = 1.3; robe.castShadow = true; g.add(robe);
    const hood = orb(g, 0.5, 0, 2.87, 0, 0x72607b); hood.scale.set(1,1.2,0.9);
    bevel(g,0.48,0.45,0.12,0,2.85,0.43,0x201f2b);
    for(const sign of [-1,1]) {
      orb(g,0.045,sign*0.14,2.96,0.51,0xf5bd81,0xcc5c2a);
      bevel(g,0.23,1.2,0.27,sign*0.75,1.85,0,0x72607b);
      for(let i=0;i<9;i++) {
        const link=new THREE.Mesh(new THREE.TorusGeometry(0.09,0.018,6,10),material(0xc4aa7d));
        link.position.set(sign*0.78,1.62-i*0.12,0.18); link.rotation.y=i%2*Math.PI/2; g.add(link);
      }
      orb(g,0.18,sign*0.78,0.49,0.18,0x9d775b,0xb85a30);
    }
    bevel(g,0.06,2.1,0.035,0,1.3,0.69,0xd6bd87,true);
  } else if (kind === 'gatekeeper') {
    bevel(g, 1.4, 1.8, 1.2, 0, 1.6, 0, 0x67736c); bevel(g, 1.1, 0.75, 1.0, 0, 3, 0, 0x7d8272);
    for (const sign of [-1, 1]) {
      bevel(g, 0.42, 0.75, 0.55, sign * 0.4, 0.55, 0, 0x566460);
      bevel(g, 0.5, 1.4, 0.6, sign * 0.95, 1.55, 0, 0x718071);
      bevel(g, 0.45, 0.35, 0.6, sign * 0.95, 2.5, 0, 0x919078);
    }
    orb(g, 0.22, 0, 2, 0.66, 0xffb36e, 0xf27225);
    bevel(g, 0.5, 0.11, 0.06, 0, 3.03, 0.54, 0xe9b86d, 0xa94716);
    for (let i = 0; i < 3; i++) bevel(g, 0.08, 1.3, 0.06, (i - 1) * 0.37, 1.6, 0.65, 0xbaae83);
    for (const sign of [-1, 1]) {
      bevel(g, 0.32, 0.55, 0.2, sign * 0.42, 3.54, 0, 0x94917f);
      orb(g, 0.12, sign * 0.78, 2.32, 0.07, 0xafa68c);
      bevel(g, 0.13, 0.07, 0.03, sign * 0.26, 3.07, 0.56, 0xffce81, true);
      bevel(g, 0.035, 0.72, 0.03, sign * 0.71, 1.7, 0.61, 0xfbc786, true).material.emissive.setHex(0xa94716);
    }
  } else {
    const stone = kind === 'guard', shield = kind === 'shield', ash = kind === 'ashpriest', color = stone ? 0x7a857a : shield ? 0x746e88 : ash ? 0x795e75 : 0x6d8278;
    const robe = new THREE.Mesh(new THREE.ConeGeometry(stone ? 0.39 : 0.3, 1.1, 16), material(color));
    robe.position.y = 0.65; robe.castShadow = true; g.add(robe);
    bevel(g, stone ? 0.66 : 0.47, 0.54, 0.4, 0, 1.2, 0, color);
    orb(g, 0.21, 0, 1.66, 0, stone ? 0x919581 : 0xb5b89f);
    bevel(g, 0.25, 0.05, 0.05, 0, 1.69, 0.2, 0xe9be77, 0x8f501d);
    if (kind !== 'archer') for (const sign of [-1, 1]) bevel(g, 0.15, 0.66, 0.17, sign * 0.36, 1.04, 0, color);
    for (const sign of [-1, 1]) {
      const leg = bevel(g, 0.17, 0.42, 0.24, sign * 0.15, 0.25, 0.03, 0x3f504c); leg.name = `leg-${sign}`;
      bevel(g, 0.3, 0.16, 0.48, sign * 0.38, 1.43, 0, stone ? 0xaba78e : 0x967b50, true);
    }
    bevel(g, 0.52, 0.1, 0.44, 0, 0.85, 0, 0x9f8d63, true);
    orb(g, 0.06, 0, 0.86, 0.27, 0x9bddc9, 0x347c73);
    if (!stone) {
      const hood = orb(g, 0.27, 0, 1.66, -0.025, color); hood.scale.set(1.1, 1.05, 0.9);
      bevel(g, 0.29, 0.23, 0.12, 0, 1.63, 0.2, 0x263c3d);
      for (const sign of [-1, 1]) orb(g, 0.027, sign * 0.073, 1.68, 0.27, 0xf3ca80, 0xaa611d);
    }
    if (stone) { orb(g, 0.13, 0, 1.27, 0.24, 0xf1b774, 0x944719); bevel(g, 0.18, 1.65, 0.15, 0.54, 1.13, 0.15, 0x85927d); }
    if (shield) {
      const panel = bevel(g, 0.79, 1.14, 0.12, 0, 0.95, 0.4, 0x597e83, 0x173f4b); panel.name = 'shield';
      panel.material.metalness = 0.72; panel.material.roughness = 0.3;
      const emblem = ring(panel, 0.24, 0xace2df); emblem.rotation.x = 0; emblem.position.set(0, 0, 0.07);
      for (const sign of [-1, 1]) {
        bevel(panel, 0.045, 1.03, 0.04, sign * 0.35, 0, 0.065, 0xc1b994, true);
        bevel(panel, 0.71, 0.045, 0.04, 0, sign * 0.5, 0.065, 0xc1b994, true);
      }
      bevel(g, 0.09, 1.38, 0.09, 0.54, 0.95, 0.2, 0xaaa88d);
    } else if (ash) {
      bevel(g,0.055,1.85,0.055,0.5,1,0.12,0xbba57e,true);
      for(let i=0;i<3;i++) orb(g,0.065,(i-1)*0.12+0.5,1.98,0.12,0xf2a073,0xb84b25);
    } else if (!stone) {
      // Figures face local +Z. Keep the stock, bolt and both hands on that aim axis.
      const bow = new THREE.Group(); bow.name = 'bow'; bow.position.set(0.06, 1.18, 0.26); g.add(bow);
      bevel(bow, 0.12, 0.1, 0.64, 0, 0, 0.08, 0x876c49);
      bevel(bow, 0.06, 0.025, 0.68, 0, 0.065, 0.1, 0xbeb38c, true);
      bevel(bow, 0.07, 0.2, 0.09, 0.08, -0.1, -0.02, 0x594e3a);
      for (const sign of [-1, 1]) {
        const limb = bevel(bow, 0.38, 0.045, 0.065, sign * 0.19, 0.035, 0.34, 0xbeb38c, true);
        limb.rotation.y = sign * 0.12;
        const string = box(bow, Math.hypot(0.36, 0.28), 0.009, 0.009, sign * 0.18, 0.04, 0.16, 0xd1c4a0);
        string.rotation.y = -Math.atan2(0.28, sign * 0.36);
      }
      const bolt = bevel(bow, 0.018, 0.018, 0.59, 0, 0.085, 0.13, 0xd1c4a0, true);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), material(0xbeb38c));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.34; bolt.add(tip);
      const arm = (from: number[], to: number[]) => {
        const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), center = start.clone().add(end).multiplyScalar(0.5);
        const part = bevel(g, 0.145, start.distanceTo(end), 0.145, center.x, center.y, center.z, color);
        part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
      };
      // Right hand grips the trigger; left hand supports the forward stock.
      for (const [shoulder, elbow, hand] of [
        [[0.36, 1.36, 0], [0.3, 1.04, 0.18], [0.14, 1.1, 0.24]],
        [[-0.36, 1.36, 0], [-0.3, 1.04, 0.18], [-0.02, 1.11, 0.52]],
      ]) {
        arm(shoulder, elbow); arm(elbow, hand);
        bevel(g, 0.12, 0.12, 0.12, hand[0], hand[1], hand[2], 0xa6aa91);
      }
    }
  }
  const top = BODY_HEIGHT[kind] * SCALE;
  const health = new THREE.Group(); health.name = 'health'; health.position.y = top + 0.25;
  const bg = bevel(health, 0.8, 0.05, 0.01, 0, 0, 0, 0x253333); bg.castShadow = false;
  const fill = bevel(health, 0.78, 0.035, 0.015, 0, 0, 0.01, 0xf3ab77, 0x6a3018); fill.name = 'fill'; fill.castShadow = false;
  g.add(health); return g;
}
