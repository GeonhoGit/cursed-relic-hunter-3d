import { expect, test } from '@playwright/test';

test('third-region heart links, danger lanes and wave geometry release GPU resources',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const w='/src/game/world.ts',s='/src/core/simulation.ts',b='/src/core/boss.ts',r='/src/core/region.ts',h='/src/core/heart-boss.ts';
    const {World}=await import(w),{createDungeonRun}=await import(s),{createBoss,startBossPattern}=await import(b),{enterNextRegion}=await import(r),{damageHeartPillar}=await import(h);
    const host=document.createElement('div');host.style.cssText='position:fixed;width:640px;height:400px;inset:0';document.body.append(host);
    const world=new World(host),first=createDungeonRun(42),third=createDungeonRun(42);
    for(let i=0;i<2;i++){third.expedition.room=8;third.expedition.dungeon.rooms[8].visited=third.expedition.dungeon.rooms[8].cleared=true;third.boss=createBoss(third);third.boss.hp=0;third.phase='cleared';enterNextRegion(third);}
    await new Promise(requestAnimationFrame);world.paint(first,-Math.PI/2,0,false,false);const before={...world.renderer.info.memory};
    let visiblePillarHp=false;
    for(let i=0;i<6;i++){
      third.expedition.room=i%3+1;third.phase='combat';third.trapTicks=i*72;world.paint(third,-Math.PI/2,0,false,false);
      third.expedition.room=8;delete third.trapTicks;third.boss=createBoss(third);third.boss.stage=2;third.boss.hp=2340;third.boss.shieldLinks=1;third.boss.pillarIndex=0;third.boss.pillarHp=100;
      world.paint(third,-Math.PI/2,0,false,false);
      const bar=world.entities.get('heart-pillar-bar-0'),pillar=third.boss.pillarIndex;
      visiblePillarHp=!!bar && (Math.abs(bar.position.x-(224-320)*.04)>.64 || Math.abs(bar.position.z-(128-183)*.04)>.8) && pillar===0;
      damageHeartPillar(third,0,100);
      for(const pattern of ['laser','pulse','shockwave']){startBossPattern(third,pattern);world.paint(third,-Math.PI/2,0,false,false);}
      third.boss.mode='wave';third.boss.shockRadius=0;third.boss.shockHit=false;
      for(let radius=8;radius<300;radius+=8){third.boss.shockRadius=radius;world.paint(third,-Math.PI/2,0,false,false);}
      delete third.boss;world.paint(first,-Math.PI/2,0,false,false);
    }
    const after={...world.renderer.info.memory};host.remove();return{before,after,visiblePillarHp};
  });
  expect(result.visiblePillarHp).toBe(true);expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries+1);expect(result.after.textures).toBeLessThanOrEqual(result.before.textures+1);
});

test('crossbow bolts align their visible shaft with pitched shots and returning trajectories',async({page})=> {
  await page.goto('/');
  const dots=await page.evaluate(async()=> {
    const w='/src/game/world.ts',s='/src/core/simulation.ts',t='/node_modules/three/build/three.module.js';
    const {World}=await import(w),{createDungeonRun}=await import(s),THREE=await import(t);
    const host=document.createElement('div');host.style.cssText='position:fixed;width:640px;height:400px;inset:0';document.body.append(host);
    const world=new World(host),run=createDungeonRun(42);run.weapon='W03';await new Promise(requestAnimationFrame);
    const dots=[];
    for(const [vx,vy,heightVelocity] of [[400,0,160],[0,-400,160],[240,320,-140],[-400,0,-160]]) {
      const b={id:run.nextId++,x:320,y:183,height:34,heightVelocity,vx,vy,life:75,owner:'player',damage:14,phase:vx<0?'return':undefined};run.bullets=[b];
      world.paint(run,-Math.PI/2,0,false,false);
      const shown=world.entities.get(`bullet-${b.id}`).getWorldDirection(new THREE.Vector3());
      dots.push(shown.dot(new THREE.Vector3(vx,heightVelocity,vy).normalize()));
    }
    host.remove();return dots;
  });
  for(const dot of dots)expect(dot).toBeCloseTo(1,6);
});

test('expanded textured rooms release GPU resources when revisited', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const worldModule = '/src/game/world.ts', simulationModule = '/src/core/simulation.ts';
    const { World } = await import(worldModule), { createDungeonRun } = await import(simulationModule);
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;width:640px;height:400px;inset:0';
    document.body.append(host); const world = new World(host), run = createDungeonRun(42);
    await new Promise(requestAnimationFrame);
    world.paint(run, -Math.PI / 2, -0.08, false, false);
    const floor = world.room.children.find((object: any) => object.geometry?.type === 'PlaneGeometry');
    const size = { width: floor.geometry.parameters.width, depth: floor.geometry.parameters.height };
    const surfaces = { normal: !!floor.material.normalMap, roughness: !!floor.material.roughnessMap };
    const before = { ...world.renderer.info.memory };
    // Walk the three terrains and revisit the same room repeatedly; resources must not accumulate.
    for (let i = 0; i < 12; i++) {
      run.expedition.room = i % 3 + 1; world.paint(run, -Math.PI / 2, 0, false, false);
      run.expedition.room = 0; world.paint(run, -Math.PI / 2, 0, false, false);
    }
    const after = { ...world.renderer.info.memory };
    const shadow = world.scene.children.find((object: any) => object.isDirectionalLight).shadow.mapSize.x;
    host.remove();
    return { size, surfaces, before, after, shadow };
  });
  expect(result.size.width).toBeCloseTo(36.864); expect(result.size.depth).toBeCloseTo(18.048);
  expect(result.surfaces).toEqual({ normal: true, roughness: true }); expect(result.shadow).toBe(2048);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
});
test('region changes, spikes and priest telegraphs release GPU resources on revisit',async({page})=> {
  await page.goto('/');
  const result=await page.evaluate(async()=> {
    const w='/src/game/world.ts',s='/src/core/simulation.ts',b='/src/core/boss.ts',r='/src/core/region.ts';
    const {World}=await import(w),{createDungeonRun}=await import(s),{createBoss,startBossPattern}=await import(b),{enterNextRegion}=await import(r);
    const host=document.createElement('div');host.style.cssText='position:fixed;width:640px;height:400px;inset:0';document.body.append(host);
    const world=new World(host),first=createDungeonRun(42),second=createDungeonRun(42);
    second.expedition.room=8;second.expedition.dungeon.rooms[8].visited=second.expedition.dungeon.rooms[8].cleared=true;
    second.boss=createBoss(second);second.boss.hp=0;second.phase='cleared';enterNextRegion(second);
    await new Promise(requestAnimationFrame);world.paint(first,-Math.PI/2,0,false,false);
    const before={...world.renderer.info.memory};
    for(let i=0;i<9;i++) {
      second.expedition.room=i%3+1;second.phase='combat';second.trapTicks=i*60;
      world.paint(second,-Math.PI/2,-0.1,false,false);
      second.expedition.room=8;delete second.trapTicks;second.boss=createBoss(second);
      for(const pattern of ['chains','ring','ritual']) {
        startBossPattern(second,pattern);world.paint(second,-Math.PI/2,0,false,false);
      }
      delete second.boss;world.paint(first,-Math.PI/2,0,false,false);
    }
    const after={...world.renderer.info.memory};host.remove();return{before,after};
  });
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries+1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures+1);
});
