"""Correct held swords in the existing reviewed scene, preserving other clips."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sword_edge_alignment import align_edges

OUT=Path(__file__).resolve().parents[1]/'art/monster-review'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'monsters-combat-review.blend'))
scene=bpy.context.scene
results=align_edges(scene)
(OUT/'sword-edge-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
scene.frame_set(1)
scene['sword_edge_alignment_fixed']=True
scene['game_applied']=False
output=OUT/'monsters-combat-edge-fixed.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print('EDGE_FIXED_BLEND_SAVED',output,flush=True)

# Close-up evidence of both swords from the corrected all-monster scene.
# The full review arrangement remains in the saved file.
studio=bpy.data.collections['00 | REVIEW STUDIO']
for obj in studio.objects:obj.hide_render=True
for collection in scene.collection.children:
    if collection!=studio:collection.hide_render=True
for name in ('heartguard','voidknight'):
    bpy.data.objects[name].users_collection[0].hide_render=False
camera=scene.camera
camera.hide_render=False
center=Vector((0,0,0))
for kind in ('heartguard','voidknight'):center+=bpy.data.objects[kind].location
center/=2
target=center+Vector((0,-.2,1.25))
camera.location=target+Vector((3.4,-10.5,3.8))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=10.4
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
scene.display.shading.show_shadows=False;scene.display.shading.background_type='WORLD'
scene.render.resolution_x=1200;scene.render.resolution_y=600
scene.render.image_settings.file_format='PNG'
scene.frame_set(136)
scene.render.filepath=str(OUT/'swords-edge-fixed.png')
bpy.ops.render.render(write_still=True)
scene.frame_start=121;scene.frame_end=192;scene.frame_step=2
folder=OUT/'sword-frames';folder.mkdir(exist_ok=True)
scene.render.filepath=str(folder/'frame-')
bpy.ops.render.render(animation=True)
print('SWORD_EDGE_PREVIEW_READY',flush=True)
