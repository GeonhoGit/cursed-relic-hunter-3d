import bpy
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sword_edge_alignment import audit
folder=Path(__file__).resolve().parents[1]/'art/monster-review'
bpy.ops.wm.open_mainfile(filepath=str(folder/'monsters-combat-review.blend'))
results=[audit(bpy.context.scene,kind) for kind in ('heartguard','voidknight')]
(folder/'sword-edge-before.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
for row in results:
    print('SWORD_EDGE_BEFORE',row['kind'],'edge minimum',round(row['minimum_edge_alignment'],4),
        'flat face maximum',round(row['maximum_flat_face_alignment'],4),flush=True)
