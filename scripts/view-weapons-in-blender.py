"""Import the current game weapons into an editable Blender inspection scene."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

project = Path(__file__).resolve().parents[1]
output = project / "art" / "weapon-models.blend"
output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

weapons = [
    ("W01", "유물 사수기", "RELIC SIDEARM", -3.0),
    ("W02", "산탄 성물", "SCATTER RELIC", -1.0),
    ("W03", "관측자의 쇠뇌", "OBSERVER CROSSBOW", 1.0),
    ("W04", "균열 지팡이", "RIFT STAFF", 3.0),
]
report = []
for weapon_id, korean_name, label, x in weapons:
    source = project / "public" / "models" / "weapons" / f"{weapon_id.lower()}.glb"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = set(bpy.data.objects) - before
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No meshes imported for {weapon_id}")
    collection = bpy.data.collections.new(f"{weapon_id} · {korean_name}")
    bpy.context.scene.collection.children.link(collection)
    for obj in imported:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector(tuple(min(p[axis] for p in points) for axis in range(3)))
    maximum = Vector(tuple(max(p[axis] for p in points) for axis in range(3)))
    center = (minimum + maximum) / 2
    offset = Vector((x - center.x, -center.y, -minimum.z))
    for obj in imported:
        if obj.parent not in imported:
            obj.location += offset
    report.append({
        "id": weapon_id,
        "source": str(source),
        "mesh_objects": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "dimensions": list(maximum - minimum),
    })

    text_data = bpy.data.curves.new(f"{weapon_id} label", "FONT")
    text_data.body = f"{weapon_id}  {label}"
    text_data.size = .16
    text_data.align_x = "CENTER"
    text_obj = bpy.data.objects.new(f"{weapon_id} label", text_data)
    bpy.context.scene.collection.objects.link(text_obj)
    text_obj.location = (x, -1.03, .025)
    text_obj.rotation_euler.x = math.pi / 2

floor_material = bpy.data.materials.new("Preview floor")
floor_material.diffuse_color = (.035, .065, .07, 1)
floor_material.use_nodes = True
floor_material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (.035, .065, .07, 1)
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, -.035))
floor = bpy.context.object
floor.name = "Inspection floor"
floor.scale = (4.5, 1.5, 1)
floor.data.materials.append(floor_material)

bpy.ops.object.camera_add(location=(4, -8, 5))
camera = bpy.context.object
camera.name = "Weapons overview"
camera.rotation_euler = (Vector((0, 0, .55)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 8.7
bpy.context.scene.camera = camera
for name, location, energy, color, size in [
    ("Soft key", (1, -3, 6), 1500, (1.0, .85, .65), 6),
    ("Cool rim", (-3, 2, 4), 1000, (.55, 1.0, .9), 4),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, .4)) - light.location).to_track_quat("-Z", "Y").to_euler()

bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 1600
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.world.color = (.07, .07, .07)

for obj in bpy.context.selected_objects:
    obj.select_set(False)
bpy.context.view_layer.objects.active = None
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.shading.type = "SOLID"
            space.shading.color_type = "MATERIAL"
            space.shading.use_scene_lights = False
            space.shading.use_scene_world = False
            space.overlay.show_overlays = False
            space.region_3d.view_location = Vector((0, 0, .55))
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            space.region_3d.view_distance = 8.2
            space.region_3d.view_perspective = "ORTHO"

bpy.ops.wm.save_as_mainfile(filepath=str(output))
(output.parent / "weapon-models-import.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("WEAPONS_IMPORTED " + json.dumps(report, ensure_ascii=False))
print("BLEND_SAVED " + str(output))
