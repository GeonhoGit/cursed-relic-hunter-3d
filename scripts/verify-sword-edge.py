"""Check saved edge alignment and preservation of the authored swing path."""
import bpy
import sys
import math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sword_edge_alignment import sword_for,strike_windows,tangent
folder=Path(__file__).resolve().parents[1]/'art/monster-review'
frames=(1,40,121,136,152,171,193,201,240)
bpy.ops.wm.open_mainfile(filepath=str(folder/'monsters-combat-review.blend'))
original={}
for frame in frames:
    bpy.context.scene.frame_set(frame)
    for kind in ('heartguard','voidknight'):
        sword=sword_for(bpy.context.scene,kind)
        original[kind,frame]=sword.matrix_world@Vector((0,0,.70))
bpy.ops.wm.open_mainfile(filepath=str(folder/'monsters-combat-edge-fixed.blend'))
scene=bpy.context.scene
for kind in ('heartguard','voidknight'):
    sword=sword_for(scene,kind)
    values=[]
    for start,end in strike_windows(kind):
        for step in range(math.ceil(start*4),math.floor(end*4)+1):
            frame=step/4
            direction=tangent(scene,sword,frame)
            edge=(sword.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
            values.append(abs(direction.dot(edge)))
    assert min(values)>.985, (kind,min(values))
    for frame in frames:
        scene.frame_set(frame)
        center=sword.matrix_world@Vector((0,0,.70))
        assert (center-original[kind,frame]).length<1e-5, (kind,frame,'swing path changed')
    for frame in (1,40,120,193,201,240):
        scene.frame_set(frame)
        assert abs(sword.rotation_euler.z)<1e-5, (kind,frame,'rest pose changed')
    print('SAVED_EDGE_VERIFIED',kind,'samples',len(values),'minimum',round(min(values),5),
        'swing path and idle/walk/hit preserved',flush=True)
