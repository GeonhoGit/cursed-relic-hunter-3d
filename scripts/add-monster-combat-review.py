"""Extend the reviewed lineup with authored attack and hit-reaction animation."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sword_edge_alignment import align_edges

OUT = Path(__file__).resolve().parents[1] / 'art' / 'monster-review'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'monsters-motion-review.blend'))
scene = bpy.context.scene
scene.frame_set(121)
scene.frame_end = 240
scene.name = 'Monster combat review | idle walk attack hit'
studio = bpy.data.collections['00 | REVIEW STUDIO']
models = json.loads((OUT/'monster-manifest.json').read_text(encoding='utf-8'))['models']

def base(obj):
    return obj.name.split('.')[0]

def matches(obj, prefixes):
    return any(base(obj).startswith(prefix) for prefix in prefixes)

def find(root, prefix):
    return next((obj for obj in root.users_collection[0].objects if matches(obj,[prefix])),None)

def root_point(root,obj):
    return root.matrix_world.inverted() @ obj.matrix_world.translation

def pivot(root,name,origin,objects,parent=None):
    obj=bpy.data.objects.new(root.name+' | '+name,None)
    root.users_collection[0].objects.link(obj)
    obj.parent=root;obj.location=origin;obj.empty_display_size=.08
    bpy.context.view_layer.update()
    for part in objects:
        world=part.matrix_world.copy()
        part.parent=obj;part.matrix_parent_inverse=Matrix.Identity(4)
        part.matrix_basis=obj.matrix_world.inverted()@world
    if parent:
        world=obj.matrix_world.copy();obj.parent=parent
        obj.matrix_basis=parent.matrix_world.inverted()@world
    return obj

def record(obj,frame,location=None,rotation=None,scale=None):
    for prop,value in [('location',location),('rotation_euler',rotation),('scale',scale)]:
        if value is not None:
            setattr(obj,prop,value)
            obj.keyframe_insert(data_path=prop,frame=frame,group='Attack and hit reaction')

def smooth(a,b,t):
    t=max(0,min(1,(t-a)/(b-a)))
    return t*t*(3-2*t)

def envelope(t):
    return smooth(0,.38,t)*(1-smooth(.72,1,t))

def stroke(t):
    # Deliberate windup, fast release, then a slower recovery.
    return -.55*smooth(0,.36,t)+1.8*smooth(.38,.48,t)-1.25*smooth(.56,.91,t)

ATTACKS={
    'rat':'몸을 낮춘 뒤 짧게 덮치기', 'archer':'쇠뇌 조준·시위 방출·발사 반동',
    'guard':'상체를 낮춘 돌진 준비와 전진', 'shield':'방패로 막으며 창 찌르기',
    'ashpriest':'지팡이 들기와 화염 시전', 'watcher':'눈 집중과 궤도 가속',
    'heartguard':'검으로 두 차례 연속 베기', 'riftshaman':'지팡이 들기와 균열 시전',
    'voidknight':'검을 크게 들어 사선 베기', 'sealcaster':'봉인판 들어 올리기와 밀어내기',
    'chainhound':'턱 벌리기·전진·물기', 'readerstatue':'책 들어 올리기와 광선 집중',
    'gatekeeper':'양팔 들기와 무거운 내려찍기', 'chainpriest':'팔을 펼쳐 사슬 휘두르기',
    'relicheart':'심장 수축·팽창과 궤도 방출',
}
rigs=[]
for index,model in enumerate(models):
    kind=model['kind'];root=bpy.data.objects[kind]
    scene.frame_set(121);bpy.context.view_layer.update()
    collection=root.users_collection[0]
    upper=find(root,kind+' | waist') or find(root,kind+' | upper-body') or find(root,kind+' | reading-arms')
    legs=[obj for obj in collection.objects if (base(obj).startswith('leg-') or
        base(obj).startswith('foot-') or base(obj).startswith(kind+' | leg-') or
        base(obj).startswith('Boot beneath robe'))]
    arms=[(find(root,kind+f' | arm-{sign}'),sign) for sign in (-1,1)]
    arms=[entry for entry in arms if entry[0]]
    if kind in ('ashpriest','riftshaman','chainpriest'):
        for sign in (-1,1):
            bpy.context.view_layer.update()
            objects=[obj for obj in upper.children if matches(obj,['Shoulder fabric','Upper sleeve',
                'Folded sleeve','Wrist cuff','Gripping fingers','Connected ceremonial sleeve'])
                and root_point(root,obj).x*sign>0]
            if sign>0:
                staff=find(root,'rift-staff' if kind=='riftshaman' else 'ash-staff')
                if staff:objects.append(staff)
            chain=find(root,kind+f' | censer-chain-{sign}')
            if chain:objects.append(chain)
            origin=(sign*.47,0,2.32) if kind=='chainpriest' else (sign*.31,0,1.34)
            arm=pivot(root,f'casting-arm-{sign}',origin,objects,upper)
            arms.append((arm,sign))

    wrist=None
    if kind in ('heartguard','voidknight','shield'):
        right=next(obj for obj,sign in arms if sign==1)
        prefixes=['guardian-sword'] if kind=='heartguard' else ['void-sword'] if kind=='voidknight' else ['Guard spear haft','Forged spearhead']
        objects=[obj for obj in collection.objects if matches(obj,prefixes)]
        wrist=pivot(root,'weapon-wrist',(.48,-.16,1.09),objects,right)

    head=None
    if kind in ('rat','chainhound'):
        prefixes=['Rat skull','Tapered snout','Dark nose','Stone ear','Ear hollow','Rat amber eye'] if kind=='rat' else [
            'Hound skull','Long armored snout','Hound nose','Predator eye','Pointed hound ear','hound-jaw']
        objects=[obj for obj in root.children if matches(obj,prefixes)]
        head=pivot(root,'attack-head',(0,-.37,.36) if kind=='rat' else (0,-.48,.87),objects)
    floating=find(root,kind+' | floating-eye')
    heart=find(root,'heart-core')
    jaw=find(root,'hound-jaw')
    bow=find(root,'bow')
    bolts=[obj for obj in collection.objects if matches(obj,['Ready crossbow bolt','Bolt head'])] if kind=='archer' else []
    string_key=None
    if kind=='archer':
        string=find(root,'Crossbow tension string')
        bpy.ops.object.select_all(action='DESELECT');string.select_set(True)
        bpy.context.view_layer.objects.active=string;bpy.ops.object.convert(target='MESH')
        string.shape_key_add(name='Rest tension')
        string_key=string.shape_key_add(name='Attack draw')
        for vertex in string_key.data:
            vertex.co.y+=.12*max(0,1-abs(vertex.co.x)/.5)

    # All new joints have explicit rest keys across the earlier review sections.
    new_joints=[obj for obj in (wrist,head) if obj]
    new_joints += [obj for obj,_ in arms if 'casting-arm' in obj.name]
    for obj in new_joints:
        record(obj,1,rotation=tuple(obj.rotation_euler))
        record(obj,121,rotation=tuple(obj.rotation_euler))
    animated=[obj for obj in collection.objects if obj.animation_data]
    # Freeze the evaluated rest pose before assigning the additional animation.
    rest={obj.name:(obj.location.copy(),obj.rotation_euler.copy(),obj.scale.copy()) for obj in collection.objects}
    cloth=[obj.data.shape_keys.key_blocks.get('Soft hem sway') for obj in collection.objects
        if obj.type=='MESH' and obj.data.shape_keys and obj.data.shape_keys.key_blocks.get('Soft hem sway')]
    orbits=[obj for obj in collection.objects if matches(obj,['heart-orbit-','watcher-orbit-'])]
    tail=find(root,kind+' | tail-joint')
    foot_objects=[obj for leg in legs for obj in ([leg] if leg.type=='MESH' else list(leg.children_recursive))
        if obj.type=='MESH' and matches(obj,['Grounded armored boot','Rat paw','Grounded hound paw',
            'Guardian grounded foot','Boot beneath robe'])]
    tier=(index//5)*3.2
    for frame in range(121,242):
        scene.frame_set(frame)
        # Every channel is reset, so later poses cannot accumulate transforms.
        for obj in collection.objects:
            location,rotation,scale=rest[obj.name]
            obj.location=location;obj.rotation_euler=rotation;obj.scale=scale
        time=(frame-121)/71
        attack=max(0,min(1,time))
        charge=envelope(attack) if frame<=192 else 0
        release=smooth(.38,.48,attack)*(1-smooth(.58,.85,attack)) if frame<=192 else 0
        strike=stroke(attack) if frame<=192 else 0
        hit_time=(frame-193)/47
        # A sharp impact is followed by a smaller rebound and full recovery.
        hit=smooth(.10,.17,hit_time)*(1-smooth(.20,.55,hit_time))
        recoil=hit*(1+.10*math.sin(max(0,hit_time-.17)*26))
        root.rotation_euler.x=-.085*recoil
        root.location.y+=.06*recoil
        if upper:
            upper.rotation_euler.x-=.20*recoil
            upper.rotation_euler.z+=.065*recoil
        if head:
            head.rotation_euler.x-=.16*recoil
        for key in cloth:
            key.value=.12*charge-.65*recoil
            key.keyframe_insert(data_path='value',frame=frame)
        if kind=='rat':
            root.location.y-=.18*release
            root.rotation_euler.x+=.12*charge
            head.rotation_euler.x+=.22*strike
        elif kind=='chainhound':
            root.location.y-=.19*release
            root.rotation_euler.x+=.09*charge
            head.rotation_euler.x+=.13*strike
            jaw.rotation_euler.x+=.52*charge*(1-smooth(.41,.49,attack))+.06*release
        elif kind=='archer':
            upper.rotation_euler.x+=.055*charge-.14*release
            upper.rotation_euler.z-=.025*charge
            string_key.value=charge*(1-smooth(.39,.45,attack))
            string_key.keyframe_insert(data_path='value',frame=frame)
            fired=.001 if frame<=192 and .45<attack<.78 else 1
            for bolt in bolts:bolt.scale=rest[bolt.name][2]*fired
        elif kind=='guard':
            upper.rotation_euler.x+=.19*charge
            root.location.y-=.20*release
            for arm,sign in arms:arm.rotation_euler.x-=.28*charge
        elif kind=='shield':
            for arm,sign in arms:
                arm.rotation_euler.x+=(-.22 if sign>0 else -.13)*release
                arm.rotation_euler.z+=sign*.13*charge
            wrist.rotation_euler.x+=1.25*charge
            upper.location.y-=.07*release
            upper.rotation_euler.x+=.07*release
        elif kind in ('heartguard','voidknight'):
            if kind=='heartguard':
                first=stroke(min(1,attack*2)) if attack<=.50 else 0
                second=stroke(max(0,min(1,(attack-.48)/.52))) if attack>.48 else 0
                sword_stroke=first+second
                slash_side=first-second
            else:
                sword_stroke=strike;slash_side=strike
            wrist.rotation_euler.x+=1.10*sword_stroke
            wrist.rotation_euler.z-=.85*slash_side
            upper.rotation_euler.z-=.14*slash_side
            for arm,sign in arms:
                arm.rotation_euler.x-=.28*charge if sign>0 else .08*charge
                arm.rotation_euler.z+=sign*.10*charge
        elif kind in ('ashpriest','riftshaman'):
            for arm,sign in arms:
                arm.rotation_euler.x-=.70*charge if sign>0 else .48*release
                arm.rotation_euler.z-=sign*.16*charge
            upper.rotation_euler.x+=.055*release
        elif kind=='sealcaster':
            upper.rotation_euler.x-=.20*charge
            upper.location.z+=.075*charge
            upper.location.y-=.08*release
        elif kind=='readerstatue':
            upper.rotation_euler.x-=.28*charge
            upper.rotation_euler.z+=.025*strike
        elif kind=='gatekeeper':
            for arm,sign in arms:
                arm.rotation_euler.x-=.95*charge*(1-smooth(.39,.48,attack))
                arm.rotation_euler.x+=.22*release
                arm.rotation_euler.z+=sign*.12*charge
            upper.rotation_euler.x+=.22*release
            if legs:
                legs[0].location.z+=.20*charge*(1-smooth(.38,.46,attack))
                legs[0].rotation_euler.x-=.20*charge
        elif kind=='chainpriest':
            for arm,sign in arms:
                arm.rotation_euler.z-=sign*.42*charge
                arm.rotation_euler.x-=.35*release
            for sign in (-1,1):
                chain=find(root,kind+f' | censer-chain-{sign}')
                chain.rotation_euler.x+=.48*strike
                chain.rotation_euler.y+=sign*.52*strike
        elif kind=='watcher':
            floating.location.y-=.10*release
            floating.scale=rest[floating.name][2]*(1+.10*charge-.12*recoil)
            floating.rotation_euler.z+=.18*recoil
            pupil=find(root,'Vertical pupil')
            pupil.scale.x=rest[pupil.name][2].x*(1-.55*charge)
        elif kind=='relicheart':
            heart.scale=rest[heart.name][2]*(1-.08*charge+.29*release-.13*recoil)
            heart.rotation_euler.y+=.15*recoil
        if floating and kind=='watcher':floating.location.z+=.035*math.sin((frame-121)*math.tau/120)
        for i,orbit in enumerate(orbits):
            direction=1 if i%2 else -1
            spin=(frame-121)*math.tau/120 + math.tau*smooth(.12,.79,attack)
            orbit.rotation_euler.z+=direction*spin
            orbit.scale=rest[orbit.name][2]*(1-.10*charge+.055*recoil)
        if tail:tail.rotation_euler.z+=.10*charge+.16*recoil
        for obj in animated+new_joints:
            record(obj,frame,tuple(obj.location),tuple(obj.rotation_euler),tuple(obj.scale))
        for obj in bolts:
            obj.keyframe_insert(data_path='scale',frame=frame)
        if kind=='watcher':pupil.keyframe_insert(data_path='scale',frame=frame)
        if foot_objects:
            # Commit the pose before evaluation: the old walk curves must not
            # replace the newly authored arms while measuring the stance foot.
            bpy.context.view_layer.update()
            lowest=min((obj.matrix_world@Vector(corner)).z for obj in foot_objects for corner in obj.bound_box)
            root.location.z+=tier+.12-lowest
            root.keyframe_insert(data_path='location',frame=frame)
    root['attack_preview']=ATTACKS[kind]
    root['hit_preview']='Impact flinch, small rebound, return to stance'
    root['motion_preview']='Idle 1-24 | Walk 25-120 | Attack 121-192 | Hit 193-240'
    rigs.append({'kind':kind,'name':model['name'],'attack':ATTACKS[kind]})
    print(f'COMBAT_MOTION_READY {kind}',flush=True)

# Keep new scale channels at rest before their first attack key.
for obj in bpy.data.objects:
    if obj.type=='MESH' and matches(obj,['Ready crossbow bolt','Bolt head','Vertical pupil']) and obj.animation_data:
        scene.frame_set(241)
        obj.keyframe_insert(data_path='scale',frame=1)
        obj.keyframe_insert(data_path='scale',frame=120)
scene.timeline_markers.clear()
for name,frame in [('대기 / IDLE',1),('이동 / WALK',25),('공격 / ATTACK',121),
    ('피격 / HIT',193),('반복 / LOOP',240)]:
    scene.timeline_markers.new(name,frame=frame)
scene.render.fps=24
scene.sync_mode='FRAME_DROP'
align_edges(scene)

# Verify model geometry at attack and hit frames, independently of the old walk loop.
def sample(root,frame):
    scene.frame_set(frame);bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get();points=[]
    for obj in root.users_collection[0].objects:
        if obj.type not in ('MESH','CURVE'):continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh()
        points.extend(tuple(evaluated.matrix_world@v.co) for v in list(mesh.vertices)[::max(1,len(mesh.vertices)//16)])
        evaluated.to_mesh_clear()
    return points

for rig in rigs:
    root=bpy.data.objects[rig['kind']]
    baseline=sample(root,121)
    for name,frame in [('attack',151),('hit',201)]:
        pose=sample(root,frame)
        displacement=max((Vector(a)-Vector(b)).length for a,b in zip(baseline,pose))
        if displacement<.015:raise RuntimeError(f'{rig["kind"]} has no {name} motion')
        rig[name+'_max_vertex_displacement']=displacement
scene.frame_set(1)
for obj in bpy.context.selected_objects:obj.select_set(False)
bpy.context.view_layer.objects.active=None
scene['game_applied']=False
scene['review_segments']='Idle / Walk / Attack / Hit, ten-second loop'
output=OUT/'monsters-combat-review.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output))
(OUT/'monster-combat-manifest.json').write_text(json.dumps({'game_applied':False,
    'fps':24,'frames':240,'segments':{'idle':[1,24],'walk':[25,120],
    'attack':[121,192],'hit':[193,240]},'models':rigs},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'COMBAT_BLEND_SAVED {output}',flush=True)

# Small, quick review renders come directly from the animated scene.
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD'
scene.render.resolution_x=1120;scene.render.resolution_y=700
scene.render.image_settings.file_format='PNG'
for name,frame in [('attack',151),('hit',201)]:
    scene.frame_set(frame)
    scene.render.filepath=str(OUT/f'monsters-{name}-pose.png')
    bpy.ops.render.render(write_still=True)
scene.frame_start=121;scene.frame_end=240;scene.frame_step=2
sequence=OUT/'combat-frames';sequence.mkdir(exist_ok=True)
scene.render.filepath=str(sequence/'frame-')
bpy.ops.render.render(animation=True)
print('COMBAT_REVIEW_RENDERED',flush=True)
