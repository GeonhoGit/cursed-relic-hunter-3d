import bpy
from pathlib import Path
bpy.ops.wm.open_mainfile(filepath=str(Path(__file__).resolve().parents[1]/'art/monster-review/monsters-combat-review.blend'))
for name in ['gatekeeper | arm-1','ashpriest | casting-arm-1','heartguard | weapon-wrist','guard | waist']:
    obj=bpy.data.objects[name]
    print('JOINT',name,'children',[child.name for child in obj.children],flush=True)
    print('MODE',obj.rotation_mode,'DELTA',tuple(obj.delta_rotation_euler),flush=True)
    print('CONSTRAINTS',[(c.type,c.name) for c in obj.constraints],flush=True)
    for frame in [121,139,151,159,201]:
        bpy.context.scene.frame_set(frame)
        print(frame,tuple(obj.rotation_euler),flush=True)
        child=obj.children[0]
        print('WORLD',tuple(child.matrix_world.translation),flush=True)
        print('MATRIX_EULER',tuple(obj.matrix_world.to_euler()),flush=True)
        if name.startswith('gatekeeper'):
            target=next(x for x in obj.children if x.name.startswith('Stone fist'))
            print('FIST',tuple(target.matrix_world.translation),tuple(target.matrix_parent_inverse.to_euler()),flush=True)
        if name.startswith('ashpriest'):
            print('STAFF_EULER',tuple(child.matrix_world.to_euler()),'STAFF_CHILD',[(x.name,x.parent.name) for x in child.children],flush=True)
bpy.context.scene.frame_set(139)
bpy.context.scene.render.engine='BLENDER_WORKBENCH'
bpy.context.scene.render.resolution_x=1120
bpy.context.scene.render.resolution_y=700
bpy.context.scene.render.filepath=str(Path(__file__).resolve().parents[1]/'art/monster-review/verified-combat-frame139.png')
bpy.ops.render.render(write_still=True)
