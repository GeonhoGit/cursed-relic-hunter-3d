"""Add editable, joint-based review motion and a tiered lineup to the authored monsters."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path(__file__).resolve().parents[1] / 'art' / 'monster-review'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'monsters-review.blend'))
scene = bpy.context.scene
studio = bpy.data.collections['00 | REVIEW STUDIO']
manifest = json.loads((OUT / 'monster-manifest.json').read_text(encoding='utf-8'))
frames = 120
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = frames
scene.name = 'Monster motion review | idle and walk'

def base(obj):
    return obj.name.split('.')[0]

def matches(obj, prefixes):
    return any(base(obj).startswith(prefix) for prefix in prefixes)

def parent_keep(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ world

def pivot(root, name, origin, objects):
    obj = bpy.data.objects.new(root.name + ' | ' + name, None)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    obj.location = origin
    obj.empty_display_size = .08
    bpy.context.view_layer.update()
    for part in objects:
        parent_keep(part, obj)
    return obj

def record(obj, frame, location=None, rotation=None, scale=None):
    for prop, value in [('location', location), ('rotation_euler', rotation), ('scale', scale)]:
        if value is not None:
            setattr(obj, prop, value)
            obj.keyframe_insert(data_path=prop, frame=frame, group='Review motion')

def cloth_shape(obj, height):
    if obj.type == 'CURVE':
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
    if obj.type != 'MESH':
        return None
    obj.shape_key_add(name='Rest cloth')
    key = obj.shape_key_add(name='Soft hem sway')
    for vertex in key.data:
        weight = max(0, 1 - vertex.co.z / height)
        vertex.co.x += .038 * weight
        vertex.co.y += .018 * weight * math.sin(vertex.co.x * 5)
    key.slider_min = -1
    return key

rigs = []
for index, model in enumerate(manifest['models']):
    kind = model['kind']
    root = bpy.data.objects[kind]
    row, column = divmod(index, 5)
    old_position = root.location.copy()
    tier = row * 3.2
    root.location.x = (column - 2) * 3.65
    root.location.y = row * 3.4
    root.location.z += tier
    model['review_position'] = list(root.location)
    parts = list(root.children)
    legs, arms, cloth, chains = [], [], [], []
    upper = None
    base_location = root.location.copy()
    for obj in parts:
        if matches(obj, ['leg-', 'foot-']):
            legs.append((obj, obj.location.copy(), obj.rotation_euler.copy()))

    if kind == 'gatekeeper':
        for sign in (-1, 1):
            selected = [obj for obj in parts if matches(obj, ['Massive stone thigh', 'Stone knee',
                'Stone shin', 'Guardian grounded foot']) and obj.location.x * sign > 0]
            leg = pivot(root, f'leg-{sign}', (sign*.40, 0, 1.28), selected)
            legs.append((leg, leg.location.copy(), leg.rotation_euler.copy()))

    if kind in ('guard', 'shield', 'heartguard', 'voidknight', 'gatekeeper'):
        for sign in (-1, 1):
            selected = [obj for obj in parts if matches(obj, ['Shoulder fabric', 'Upper sleeve',
                'Folded sleeve', 'Wrist cuff', 'Gripping fingers', 'Overlapping shoulder plate',
                'Colossal shoulder', 'Guardian upper arm', 'Guardian elbow', 'Guardian forearm',
                'Stone fist', 'Fist finger ridge']) and obj.location.x * sign > 0]
            weapon_names = ['shield'] if sign < 0 else ['void-sword', 'guardian-sword',
                'Stone poleaxe handle', 'Heavy crescent axe blade', 'Axe edge',
                'Guard spear haft', 'Forged spearhead']
            selected += [obj for obj in parts if matches(obj, weapon_names)]
            origin = (sign*.82, 0, 2.36) if kind == 'gatekeeper' else (sign*.31, 0, 1.43)
            arm = pivot(root, f'arm-{sign}', origin, selected)
            arms.append((arm, sign))
        # The torso and arms share one waist joint so attached equipment moves together.
        selected = [obj for obj in root.children if obj not in [entry[0] for entry in legs]
            and not matches(obj, ['Split armored tabard', 'Heavy shoulder cloak'])]
        upper = pivot(root, 'waist', (0, 0, 1.12 if kind == 'gatekeeper' else .86), selected)
    elif kind in ('archer', 'ashpriest', 'riftshaman', 'sealcaster', 'chainpriest'):
        if kind == 'chainpriest':
            for sign in (-1, 1):
                selected = [obj for obj in parts if matches(obj, ['Hanging iron chain', 'Chain censer',
                    'Censer fire']) and obj.location.x * sign > 0]
                chain = pivot(root, f'censer-chain-{sign}', (sign*.74, -.10, 1.98), selected)
                chains.append((chain, sign))
        selected = [obj for obj in root.children if not matches(obj, ['Folded robe skirt',
            'Embroidered hem', 'Front robe embroidery', 'Long embroidered stole', 'Boot beneath robe'])]
        upper = pivot(root, 'upper-body', (0, 0, 1.98 if kind == 'chainpriest' else 1.10), selected)
        for obj in root.children:
            if matches(obj, ['Boot beneath robe']):
                legs.append((obj, obj.location.copy(), obj.rotation_euler.copy()))
    elif kind == 'readerstatue':
        selected = [obj for obj in parts if matches(obj, ['reader-book', 'reader-focus',
            'Shoulder fabric', 'Upper sleeve', 'Folded sleeve', 'Wrist cuff', 'Gripping fingers'])]
        upper = pivot(root, 'reading-arms', (0, 0, 1.66), selected)

    for obj in root.users_collection[0].objects:
        if matches(obj, ['Folded robe skirt', 'Embroidered hem', 'Front robe embroidery',
            'Long embroidered stole', 'Heavy shoulder cloak', 'Split armored tabard']):
            key = cloth_shape(obj, 2.22 if kind == 'chainpriest' else 1.3)
            if key:
                cloth.append(key)

    floating = None
    if kind == 'watcher':
        selected = [obj for obj in parts if matches(obj, ['Floating watcher eyeball',
            'Forward teal iris', 'Vertical pupil', 'Crown of watcher', 'Orbiting anchor', 'watcher-orbit-'])]
        floating = pivot(root, 'floating-eye', (0, 0, 1.63), selected)
    tail = next((obj for obj in parts if matches(obj, ['Tapering rat tail', 'Whip tail'])), None)
    if tail:
        tail = pivot(root, 'tail-joint', (0, .46, .26) if kind=='rat' else (0, .56, .72), [tail])
    jaw = next((obj for obj in parts if matches(obj, ['hound-jaw'])), None)
    heart = next((obj for obj in parts if matches(obj, ['heart-core'])), None)
    orbits = [obj for obj in root.users_collection[0].objects if matches(obj, ['heart-orbit-', 'watcher-orbit-'])]

    # Four seconds of motion follow one second of idle; easing returns to idle at the seam.
    for frame in range(1, frames + 2):
        t = (frame - 1) / 24
        activity = min(1, max(0, (frame-25)/12), max(0, (121-frame)/12))
        activity = activity*activity*(3-2*activity)
        phase = (frame - 25) * math.tau / (24 if kind=='rat' else 36 if kind=='chainhound' else 48)
        breath = math.sin(t*math.tau/5)
        root.location = base_location
        record(root, frame, rotation=(0, activity*.018*math.sin(phase),
            activity*.025*math.sin(phase)))
        for i, (leg, rest, rotation) in enumerate(legs):
            location = rest.copy()
            angle = phase + (math.pi if i % 2 else 0)
            if kind in ('rat', 'chainhound'):
                # Diagonal legs move together for the quadruped trot.
                angle = phase + (math.pi if i in (1, 2) else 0)
            if matches(leg, ['Boot beneath robe']):
                location.y += activity*.065*math.sin(angle)
                location.z += activity*.055*max(0, math.cos(angle))
                leg_rotation = rotation.copy()
            else:
                location.z += activity*.06*max(0, math.cos(angle))
                leg_rotation = rotation.copy()
                leg_rotation.x += activity*(.22 if kind=='gatekeeper' else .34)*math.sin(angle)
            record(leg, frame, location, leg_rotation)
        if upper:
            record(upper, frame, rotation=(.012*breath + activity*.022*math.cos(phase*2),
                0, activity*.035*math.sin(phase)))
        for arm, sign in arms:
            amplitude = .15 if kind=='shield' and sign<0 else .28
            record(arm, frame, rotation=(-sign*activity*amplitude*math.sin(phase),
                .008*breath, 0))
        for chain, sign in chains:
            record(chain, frame, rotation=(sign*(.035*breath+activity*.10*math.sin(phase-.6)),
                activity*.04*math.sin(phase), 0))
        for key in cloth:
            key.value = .3*breath + activity*.55*math.sin(phase-.8)
            key.keyframe_insert(data_path='value', frame=frame)
        if floating:
            record(floating, frame, location=(0, 0, 1.63+.06*breath),
                rotation=(0,0,.035*breath))
        if tail:
            record(tail, frame, rotation=(0,.05*breath,activity*.12*math.sin(phase)))
        if jaw:
            record(jaw, frame, rotation=(.02+.07*activity*(1+math.sin(phase))/2,0,0))
        if heart:
            beat = 1+.045*math.sin(t*math.tau*1.6)
            record(heart, frame, scale=(beat,beat,beat),location=(0,0,1.83+.035*breath))
        for i, orbit in enumerate(orbits):
            rest_rotation = orbit.rotation_euler.copy() if frame==1 else orbit['rest_rotation']
            if frame==1: orbit['rest_rotation']=list(rest_rotation)
            record(orbit,frame,rotation=(rest_rotation[0],rest_rotation[1],
                rest_rotation[2]+(frame-1)*math.tau/frames*(1 if i%2 else -1)))
        # Keep the lowest stance foot in contact with its review platform.
        if legs:
            bpy.context.view_layer.update()
            foot_objects = [obj for leg,_,_ in legs for obj in ([leg] if leg.type=='MESH' else list(leg.children_recursive))
                if obj.type=='MESH' and matches(obj,['Grounded armored boot','Rat paw',
                    'Grounded hound paw','Guardian grounded foot','Boot beneath robe'])]
            if foot_objects:
                lowest=min((obj.matrix_world@Vector(corner)).z for obj in foot_objects for corner in obj.bound_box)
                root.location.z += tier+.12-lowest
        record(root,frame,location=root.location.copy())
    root['motion_preview']='Idle 1-24 / in-place walk 25-120, 24 fps'
    rigs.append({'kind':kind,'animated_joints':sum(obj.animation_data is not None
        for obj in root.users_collection[0].objects),'cloth_channels':len(cloth)})
    print(f'MOTION_READY {kind}',flush=True)

    # Preserve the original plinth and put its label on the front of the new tier.
    plinths=sorted([obj for obj in studio.objects if base(obj)=='Model review plinth'],key=lambda o:(o.location.y,o.location.x))
    plinth=plinths[index]
    plinth.location=(root.location.x,root.location.y,tier+.055)
    labels=[obj for obj in studio.objects if obj.type=='FONT' and obj.data.body.startswith(f'{index+1:02d} ')]
    for label in labels:
        label.data.body=f'{index+1:02d}  {model["name"]}'
        label.data.font=bpy.data.fonts.load('C:/Windows/Fonts/malgun.ttf') if 'Malgun Gothic' not in bpy.data.fonts else bpy.data.fonts['Malgun Gothic']
        label.data.size=.19
        label.location=(root.location.x,root.location.y-1.425,tier-.14)
        label.rotation_euler=(math.pi/2,0,0)

# Supported steps behind each line let every silhouette read from a frontal view.
def studio_box(name,position,size):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    obj=bpy.context.object;obj.name=name;obj.scale=size
    for collection in list(obj.users_collection):collection.objects.unlink(obj)
    studio.objects.link(obj);obj.data.materials.append(bpy.data.materials['Review plinth'])
    bevel=obj.modifiers.new('Soft studio edges','BEVEL');bevel.width=.015;bevel.segments=2
    return obj

for row in range(3):
    tier=row*3.2
    if row:
        studio_box(f'Supported review tier {row+1}',(0,row*3.4,tier/2-.045),(18.3,2.6,tier-.09))
    for column in range(5):
        studio_box(f'Nameplate {row*5+column+1:02d}',((column-2)*3.65,row*3.4-1.39,tier-.09),(2.8,.05,.32))
floor=bpy.data.objects['Review studio floor']
floor.location=(0,3.4,-.28)
for light in [obj for obj in studio.objects if obj.type=='LIGHT']:
    light.location.z+=5
    light.data.energy*=1.7

bpy.ops.object.camera_add(location=(0,-24,10.8))
cam=bpy.context.object;cam.name='00 | Aligned motion comparison'
for collection in list(cam.users_collection):collection.objects.unlink(cam)
studio.objects.link(cam)
target=Vector((0,3.4,4.8))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=20.4
scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=1000
scene.timeline_markers.clear()
scene.timeline_markers.new('대기 / IDLE',frame=1)
scene.timeline_markers.new('이동 / WALK',frame=25)
scene.timeline_markers.new('반복 / LOOP',frame=120)
scene.sync_mode='FRAME_DROP'
scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_location=target
            space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.region_3d.view_distance=18.6
            space.region_3d.view_perspective='ORTHO'
            space.shading.type='SOLID';space.shading.color_type='MATERIAL'
            space.overlay.show_overlays=False

# Evidence: each model must have evaluated geometry that changes across the timeline.
def sample(root,frame):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph=bpy.context.evaluated_depsgraph_get()
    values=[]
    for obj in root.users_collection[0].objects:
        if obj.type not in ('MESH','CURVE'):continue
        evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
        values.extend(tuple(evaluated.matrix_world@vertex.co) for vertex in list(mesh.vertices)[::max(1,len(mesh.vertices)//20)])
        evaluated.to_mesh_clear()
    return values

for model,rig in zip(manifest['models'],rigs):
    first=sample(bpy.data.objects[model['kind']],1)
    later=sample(bpy.data.objects[model['kind']],40)
    displacement=max((Vector(a)-Vector(b)).length for a,b in zip(first,later))
    if displacement<.005:raise RuntimeError(f'No visible motion: {model["kind"]}')
    rig['sample_max_vertex_displacement']=displacement
scene.frame_set(1)
scene['game_applied']=False
path=OUT/'monsters-motion-review.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(path))
(OUT/'monster-motion-manifest.json').write_text(json.dumps({'game_applied':False,
    'fps':24,'frames':120,'idle_frames':[1,24],'walk_frames':[25,120],
    'arrangement':'five columns, three supported tiers','models':rigs},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'MOTION_BLEND_SAVED {path}',flush=True)

scene.frame_set(40)
scene.render.filepath=str(OUT/'monsters-aligned-motion.png')
bpy.ops.render.render(write_still=True)
# The video is a fast viewport-style preview of the exact animated geometry.
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.display.shading.background_type='WORLD'
scene.render.resolution_x=960;scene.render.resolution_y=600
scene.render.fps=12
scene.frame_step=2
scene.render.image_settings.file_format='PNG'
sequence=OUT/'motion-frames';sequence.mkdir(exist_ok=True)
scene.render.filepath=str(sequence/'frame-')
bpy.ops.render.render(animation=True)
print('MOTION_PREVIEW_RENDERED',flush=True)
