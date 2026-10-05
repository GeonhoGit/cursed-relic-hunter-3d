"""Author editable projectile design assets and an animated Blender review board.

Geometry is authored locally. This script writes only to art/projectile-review;
game projectile behavior and runtime assets remain subject to the user's review.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parents[1] / 'art' / 'projectile-review'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Projectile designs | pending game integration'
scene.world = bpy.data.worlds.new('Projectile studio world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.026,.04,.057,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35

def material(name, color, metal=0, glow=0, rough=.48):
    mat = bpy.data.materials.new(name)
    rgb = tuple(((color >> shift) & 255)/255 for shift in (16,8,0))
    mat.diffuse_color = (*rgb,1)
    mat.use_nodes = True
    node = mat.node_tree.nodes['Principled BSDF']
    linear = tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)
    node.inputs['Base Color'].default_value = (*linear,1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    node.inputs['Emission Color'].default_value = (*linear,1)
    node.inputs['Emission Strength'].default_value = glow
    return mat

TEAL = material('Player relic | jade',0x70EBCB,.25,1.5)
WHITE = material('Hot projectile core',0xE3FFF2,.1,2)
BRASS = material('Engraved brass',0xB69A62,.7)
IRON = material('Aged dark steel',0x374D53,.72)
STEEL = material('Worn cutting steel',0xA1B6B5,.72)
WOOD = material('Ash bolt shaft',0x624B3B,0,0,.8)
AMBER = material('Ember | orange',0xFF9F53,.15,1.5)
HOT = material('Flame core',0xFFF0AA,.1,2.1)
PURPLE = material('Rift | violet',0xB698F1,.15,1.6)
PINK = material('Heart | crimson pink',0xF490B7,.2,1.6)
RED = material('Enemy warning | warm red',0xDA6260,.1,.8)
STONE = material('Guardian fractured stone',0x8D9588,0,0,.85)
ICE = material('Frost | pale blue',0x91DBFF,.2,1.2)
GOLD = material('Guidance | gold',0xFFD085,.25,1.4)
RETURN = material('Return | sea green',0x70BCC0,.2,.75)
DARK = material('Orbit dark core',0x27313E,.55)
STAGE = material('Slate display',0x20333F,.28,0,.78)
LABEL = material('Warm label ivory',0xDADBC7,0,.2)
collection = None
root = None
animated_parts = []

def register(obj,name,mat,parent=None):
    obj.name = name
    for owner in list(obj.users_collection):owner.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent if parent is not None else root
    if mat:obj.data.materials.append(mat)
    return obj

def empty(name,parent=None):
    obj = bpy.data.objects.new(name,None)
    collection.objects.link(obj)
    obj.parent = parent if parent is not None else root
    obj.empty_display_size = .06
    return obj

def ico(name,pos,scale,mat,parent=None,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1)
    obj=register(bpy.context.object,name,mat,parent)
    obj.location=pos;obj.scale=scale
    return obj

def rod(name,a,b,radius,mat,end=None,sides=10,parent=None):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=sides,radius1=radius,
        radius2=radius if end is None else end,depth=(b-a).length)
    obj=register(bpy.context.object,name,mat,parent)
    obj.location=(a+b)/2
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

def tube(name,points,radius,mat,parent=None,cyclic=False):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
    data.resolution_u=5;data.bevel_depth=radius;data.bevel_resolution=1
    spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,coord in zip(spline.bezier_points,points):
        point.co=coord;point.handle_left_type=point.handle_right_type='AUTO'
    spline.use_cyclic_u=cyclic
    obj=register(bpy.data.objects.new(name,data),name,mat,parent)
    return obj

def ring(name,pos,radius,thickness,mat,parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=thickness,
        major_segments=20,minor_segments=6)
    obj=register(bpy.context.object,name,mat,parent)
    obj.location=pos;obj.rotation_euler.y=math.pi/2
    # Cant the halo slightly so its circular silhouette reads in the side view.
    obj.rotation_euler.z=-.55
    return obj

def box(name,pos,size,mat,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=register(bpy.context.object,name,mat,parent)
    obj.location=pos
    for v in obj.data.vertices:
        for axis in range(3):v.co[axis]*=size[axis]
    bevel=obj.modifiers.new('Small forged bevel','BEVEL')
    bevel.width=min(size)*.14;bevel.segments=1
    return obj

def ribbon(name,points,width,mat,parent=None):
    vertices=[]
    for i,(x,y,z) in enumerate(points):
        w=width*max(.05,1-i/max(1,len(points)-1))
        vertices.extend([(x,y-w,z),(x,y+w,z)])
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(points)-1)])
    data.update()
    return register(bpy.data.objects.new(name,data),name,mat,parent)

def trail(mat,length=1.15,amount=2):
    holder=empty('FX | short trailing wake')
    for i in range(amount):
        phase=i*math.tau/amount
        offset=.07 if amount>1 else 0
        y,z=math.cos(phase)*offset,math.sin(phase)*offset
        ribbon('FX | tapering streak',[(-.18,y,z),(-.48,y*1.5,z+.025),
            (-.83,y*.6,z-.025),(-length,0,0)],.035,mat,holder)
    for i in range(3):
        ico('FX | detached mote',(-.50-i*.27,.085*math.sin(i*2),.045*math.cos(i*2)),
            (.025,.014,.014),mat,holder)
    animated_parts.append((holder,'wake'))

def relic_bullet(mat=TEAL):
    rod('Body | pointed relic slug',(-.18,0,0),(.24,0,0),.095,mat,0,8)
    ring('Body | brass jacket',(-.13,0,0),.077,.018,BRASS)
    ico('Body | luminous nose',(.17,0,0),(.1,.055,.055),WHITE)
    trail(mat)

def bolt(enemy=False):
    mat=RED if enemy else TEAL
    rod('Body | ash arrow shaft',(-.55,0,0),(.40,0,0),.025,WOOD, sides=8)
    tip=ico('Body | broad diamond arrowhead',(.47,0,0),(.24,.075,.04),IRON if enemy else STEEL)
    for sign in (-1,1):
        vane=box('Body | distinct fletching',(-.42,sign*.055,0),(.22,.07,.022),mat)
        vane.rotation_euler.x=sign*.5
    ring('Body | nock binding',(-.52,0,0),.034,.011,BRASS)
    trail(mat,.98,1)

def split():
    holder=empty('Body | split fragments')
    for sign in (-1,0,1):
        ico('Body | jade splinter',(sign*.11,sign*.13,sign*.08),(.17,.05,.04),TEAL,holder)
    animated_parts.append((holder,'spin'))
    trail(TEAL,1.0,3)

def rift(enemy=False):
    core=empty('Body | rift crystal')
    ico('Body | lance crystal',(.04,0,0),(.42,.135,.14),PURPLE,core)
    ico('Body | light seam',(.12,-.03,.03),(.26,.045,.035),PINK if enemy else WHITE,core)
    for i in range(3):
        a=i*math.tau/3
        ico('Body | rotating fractured wing',(-.20,math.cos(a)*.20,math.sin(a)*.20),(.17,.05,.07),PURPLE,core)
    animated_parts.append((core,'spin'))
    ribbon('FX | angular rift tear',[(-.14,0,0),(-.45,.10,.06),(-.67,-.06,-.08),(-1.16,0,.03)],.055,PURPLE)

def fire():
    ico('Body | ember heart',(.03,0,0),(.21,.15,.15),HOT,sub=2)
    for i in range(5):
        a=i*math.tau/5
        tube('FX | tapered flame tongue',[(.12,math.cos(a)*.07,math.sin(a)*.07),
            (-.20,math.cos(a)*.16,math.sin(a)*.16),(-.48,math.cos(a)*.12,math.sin(a)*.09),
            (-.77-i*.04,0,0)],.032,AMBER)
    trail(AMBER,1.13,3)

def watcher():
    eye=empty('Body | watcher satellite')
    ico('Body | dark orbit seed',(0,0,0),(.20,.18,.18),DARK,eye,2)
    ico('Body | orange focused eye',(.05,-.16,.03),(.095,.03,.11),AMBER,eye)
    ring('Body | thin satellite orbit',(0,0,0),.30,.018,BRASS,eye)
    for sign in (-1,1):ico('Body | orbit node',(0,0,sign*.30),(.045,.045,.045),AMBER,eye)
    animated_parts.append((eye,'orbit'))
    trail(AMBER)

def stone():
    body=empty('Body | tumbling stone fragment')
    rock=ico('Body | jagged limestone',(0,0,0),(.30,.23,.20),STONE,body)
    for vertex in rock.data.vertices:
        vertex.co*=1+.10*math.sin(vertex.index*2.7)
    tube('Body | amber fracture seam',[(.18,-.12,.08),(.06,-.2,.02),(-.02,-.15,-.08),(-.21,-.10,-.05)],.012,AMBER,body)
    for i in range(3):ico('FX | chipped stone',(-.39-i*.14,(-1)**i*.08,.09-i*.07),(.06,.05,.035),STONE,body)
    animated_parts.append((body,'tumble'))
    trail(AMBER,.93,1)

def priest():
    body=empty('Body | burning iron censer seed')
    ico('Body | burning soul',(.02,0,0),(.16,.13,.13),HOT,body,2)
    ring('Body | censer shell',(0,0,0),.20,.026,IRON,body)
    for i in range(4):
        a=i*math.tau/4
        tube('Body | forged curved rib',[(-.15,0,0),(-.08,.18*math.cos(a),.18*math.sin(a)),
            (.12,.16*math.cos(a),.16*math.sin(a)),(.23,0,0)],.017,BRASS,body)
    animated_parts.append((body,'spin'))
    for i in range(4):
        link=ring('FX | spectral chain link',(-.34-i*.18,0,0),.06,.011,AMBER)
        link.rotation_euler=(math.pi/2 if i%2 else 0,0,0)
    trail(AMBER,1.25,1)

def heart():
    body=empty('Body | heart pulse seed')
    ico('Body | heart crystal',(0,0,0),(.22,.16,.18),PINK,body)
    for i in range(2):
        ring('Body | pulse halo',(-.1-i*.14,0,0),.27+i*.04,.014,PINK,body)
    for i in range(3):
        a=i*math.tau/3
        ico('Body | pulse shard',(.04,.27*math.cos(a),.27*math.sin(a)),(.10,.05,.05),PURPLE,body)
    animated_parts.append((body,'pulse'))
    trail(PINK,1.18,3)

def frost():
    ico('Body | frost spear',(0,0,0),(.32,.075,.075),ICE)
    for sign in (-1,1):
        ico('Body | ice facet',(-.12,sign*.09,.05),(.14,.06,.10),ICE)
    trail(ICE,1.18,2)

def reflected():
    relic_bullet()
    ring('Body | parry halo',(-.06,0,0),.20,.018,WHITE)
    for sign in (-1,1):
        tube('FX | parry crescent',[(-.38,sign*.15,0),(-.22,sign*.26,.02),(.04,sign*.23,.02)],.019,WHITE)

def homing():
    relic_bullet(GOLD)
    ribbon('FX | curved seeking path',[(-.20,0,0),(-.55,-.03,.05),(-.8,-.14,.10),(-1.17,-.32,.07)],.035,GOLD)
    for sign in (-1,1):
        ico('Body | guiding fin',(-.17,sign*.14,0),(.14,.05,.05),GOLD)

def returning():
    relic_bullet(RETURN)
    tube('FX | hooked return wake',[(-.22,-.11,0),(-.50,-.22,.04),(-.82,-.18,.03),
        (-1.01,.01,.03),(-.81,.17,.03)],.017,RETURN)

DESIGNS = [
 ('W01','유물 사수기 탄','PLAYER / SINGLE',.16,lambda:relic_bullet(), 'src/core/weapons.ts:W01'),
 ('W02','산탄 성물 탄','PLAYER / PELLET',.12,lambda:(ico('Body | faceted brass pellet',(0,0,0),(.12,.10,.10),BRASS),ico('Body | ember pellet nose',(.07,0,0),(.08,.07,.07),AMBER),trail(AMBER,.75,1)), 'src/core/weapons.ts:W02'),
 ('W03','관측자의 쇠뇌 화살','PLAYER / BOLT',.85,lambda:bolt(), 'src/core/weapons.ts:W03'),
 ('W04','균열 지팡이 마력탄','PLAYER / PIERCING',.32,lambda:rift(), 'src/core/weapons.ts:W04'),
 ('archer','궁수의 녹슨 화살','ENEMY / BOLT',.62,lambda:bolt(True), 'src/core/enemy-ai.ts:archer'),
 ('ashpriest','재의 사제 화염탄','ENEMY / FIRE',.30,fire, 'src/core/enemy-ai.ts:ashpriest'),
 ('watcher','감시자 궤도탄','ENEMY / ORBIT',.30,watcher, 'src/core/enemy-ai.ts:watcher'),
 ('riftshaman','주술사 균열 파편','ENEMY / RIFT',.32,lambda:rift(True), 'src/core/enemy-ai.ts:riftshaman'),
 ('gatekeeper','문지기 석재탄','BOSS / STONE',.40,stone, 'src/core/boss.ts:fan'),
 ('chainpriest','사슬 사제 혼불탄','BOSS / CENSER',.30,priest, 'src/core/priest-boss.ts:bullet'),
 ('relicheart','유물 심장 맥동탄','BOSS / PULSE',.32,heart, 'src/core/heart-boss.ts:bullet'),
 ('split','분열 유물 파편탄','RELIC / SPLIT',.14,split, 'src/core/projectile-effects.ts:splitShot'),
 ('reflected','패링 반사탄','RELIC / REFLECT',.18,reflected, 'src/core/dodge.ts:parryProjectile'),
 ('frost','서리 유물 냉기탄','RELIC / FROST',.22,frost, 'src/core/projectile-effects.ts:frostHit'),
 ('homing','유도 유물 추적탄','RELIC / HOMING',.18,homing, 'src/core/homing.ts:guideProjectile'),
 ('return','회귀 유물 귀환탄','RELIC / RETURN',.18,returning, 'src/core/projectile-effects.ts:expireShot'),
]
report=[]
roots=[]
for index,(kind,korean,label,runtime_length,builder,source) in enumerate(DESIGNS):
    collection=bpy.data.collections.new(f'{index+1:02d} | {korean} | {kind}')
    scene.collection.children.link(collection)
    root=None;root=empty('projectile-'+kind)
    root['kind']=kind;root['display_name']=korean
    root['game_applied']=False;root['forward_axis']='+X'
    root['nominal_runtime_body_length_m']=runtime_length
    root['review_enlarged']=True
    builder()
    x=(index%4-1.5)*4.5;y=(index//4)*3.1;z=(index//4)*2.35
    root.location=(x+.3,y,z+1.05);root.scale=(1.50,)*3
    center=root.location.copy()
    for frame in range(1,98):
        t=(frame-1)/96;phase=t*math.tau
        root.location=center+Vector((.23*math.sin(phase),0,.045*math.cos(phase)))
        root.keyframe_insert(data_path='location',frame=frame)
    roots.append(root)
    report.append({'kind':kind,'name':korean,'source':source,
        'nominal_runtime_body_length_m':runtime_length,'review_display_scale':1.5,
        'game_applied':False,'mesh_parts':sum(obj.type=='MESH' for obj in collection.objects)})
    print('PROJECTILE_DESIGN_READY',kind,flush=True)

for obj,mode in animated_parts:
    for frame in range(1,98):
        t=(frame-1)/96;phase=t*math.tau
        if mode=='spin':obj.rotation_euler.x=phase
        elif mode=='orbit':obj.rotation_euler.x=phase;obj.rotation_euler.z=.12*math.sin(phase)
        elif mode=='tumble':obj.rotation_euler=(phase,phase*2,0)
        elif mode=='pulse':obj.scale=(1+.11*math.sin(phase*4),)*3
        elif mode=='wake':obj.scale=(1+.08*math.sin(phase*6),1,1)
        obj.keyframe_insert(data_path='rotation_euler',frame=frame)
        obj.keyframe_insert(data_path='scale',frame=frame)

collection=bpy.data.collections.new('00 | PROJECTILE REVIEW STUDIO')
scene.collection.children.link(collection);root=None
font=bpy.data.fonts.load('C:/Windows/Fonts/malgun.ttf')
def text(name,body,pos,size,mat=LABEL):
    data=bpy.data.curves.new(name,'FONT');data.body=body;data.font=font
    data.size=size;data.align_x='CENTER';data.extrude=.001
    obj=register(bpy.data.objects.new(name,data),name,mat)
    obj.location=pos;obj.rotation_euler.x=math.pi/2
    return obj
for index,(_,korean,label,_,_,_) in enumerate(DESIGNS):
    x=(index%4-1.5)*4.5;y=(index//4)*3.1;z=(index//4)*2.35
    box('Review tile',(x,y,z+.04),(4.05,2.40,.11),STAGE)
    box('Front caption board',(x,y-1.20,z+.14),(4.05,.06,.42),STAGE)
    text('Caption '+korean,f'{index+1:02d}  {korean}',(x,y-1.242,z+.12),.19)
    text('Category '+label,label,(x,y-.78,z+.43),.11)
    if index//4:
        box('Supported review tier',(x,y,z/2-.02),(4.05,2.35,z-.04),STAGE)
box('Studio floor',(0,4.1,-.12),(20,16,.12),STAGE)
text('Collection title','유물 사냥꾼 · 투사체 디자인 16종',(0,9.8,9.3),.35)
text('Review notice','PLAYER · ENEMY · BOSS · RELIC  /  확대 비교 · 게임 적용 전',(0,9.8,8.95),.17)

bpy.ops.object.camera_add(location=(0,-26,16.1))
camera=register(bpy.context.object,'00 | Projectile comparison camera',None)
target=Vector((0,4.25,4.55))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=19.8
scene.camera=camera
for name,pos,energy,color,size in [
    ('Soft warm key',(-5,-6,15),3000,(1,.88,.72),8),
    ('Cool fill',(8,-1,12),2400,(.70,.87,1),7),
    ('Tier rim',(-2,13,15),3200,(.67,1,.90),7),
]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=register(bpy.context.object,name,None)
    light.data.energy=energy;light.data.color=color;light.data.size=size
    light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1600;scene.render.resolution_y=1300
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.fps=24;scene.frame_start=1;scene.frame_end=96
scene.sync_mode='FRAME_DROP';scene.view_settings.view_transform='AgX'
scene.timeline_markers.new('회전·맥동·꼬리 효과 / FX LOOP',frame=1)
scene.timeline_markers.new('반복 / LOOP',frame=96)
scene['game_applied']=False
scene['review_status']='Awaiting user review before runtime integration'
scene['note']='Projectile bodies shown enlarged. Mesh trails are review sketches for runtime FX.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='SOLID';space.shading.color_type='MATERIAL'
            space.shading.light='STUDIO';space.shading.show_cavity=True
            space.shading.show_shadows=False;space.overlay.show_overlays=False
            space.region_3d.view_location=target
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            space.region_3d.view_distance=18.5
            space.region_3d.view_perspective='ORTHO'
scene.frame_set(1)
bpy.context.view_layer.update()
# Check mesh presence, a closed motion loop, and actual changing FX channels.
for model,obj in zip(report,roots):
    scene.frame_set(1);first=obj.location.copy()
    scene.frame_set(25);moving=obj.location.copy()
    scene.frame_set(97);last=obj.location.copy()
    assert model['mesh_parts']>0 and (moving-first).length>.20
    assert (last-first).length<1e-5
    model['verified_loop']=True
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=None
blend=OUT/'projectiles-review.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
(OUT/'projectile-manifest.json').write_text(json.dumps({'game_applied':False,
    'fps':24,'frames':96,'arrangement':'four columns, four tiers',
    'trails':'authored FX sketch geometry; not a change to collision dimensions',
    'models':report},ensure_ascii=False,indent=2),encoding='utf-8')
print('PROJECTILE_BLEND_SAVED',blend,flush=True)
scene.frame_set(25)
scene.render.filepath=str(OUT/'projectiles-overview.png')
bpy.ops.render.render(write_still=True)
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
scene.display.shading.show_shadows=False;scene.display.shading.background_type='WORLD'
scene.render.resolution_x=1000;scene.render.resolution_y=810
scene.frame_step=2
(OUT/'motion-frames').mkdir(exist_ok=True)
scene.render.filepath=str(OUT/'motion-frames'/'frame-')
bpy.ops.render.render(animation=True)
print('PROJECTILE_PREVIEW_RENDERED',flush=True)
