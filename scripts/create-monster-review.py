"""Author the monster collection for Blender review, without changing game assets."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[1]
OUT = PROJECT / 'art' / 'monster-review'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.7, emission=0):
    value = bpy.data.materials.new(name)
    rgb = tuple(((color >> shift) & 255) / 255 for shift in (16, 8, 0))
    value.diffuse_color = (*rgb, 1)
    value.use_nodes = True
    node = value.node_tree.nodes.get('Principled BSDF')
    linear = tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = rough
    node.inputs['Emission Color'].default_value = (*linear, 1)
    node.inputs['Emission Strength'].default_value = emission
    return value

STONE = material('Weathered limestone', 0x86948A, 0, .84)
PALE = material('Chipped ivory stone', 0xC5C4AD, 0, .76)
SLATE = material('Deep slate', 0x3D5255, .25, .62)
IRON = material('Aged dark steel', 0x344750, .75, .39)
STEEL = material('Polished worn edges', 0x91A5AC, .76, .33)
BRASS = material('Antique brass', 0xB49C64, .68, .42)
BONE = material('Old bone', 0xD0C3A3, 0, .63)
DARK = material('Face shadow', 0x172428, 0, .94)
CLOTH = material('Dusty teal cloth', 0x405D5C, 0, .92)
ASH = material('Ash burgundy vestments', 0x704955, 0, .92)
VIOLET = material('Faded violet robes', 0x675270, 0, .9)
LEATHER = material('Brown leather', 0x493C35, 0, .85)
TEAL = material('Teal soul light', 0x8DE3D4, .12, .25, 1.5)
AMBER = material('Amber soul light', 0xF7BD70, .12, .28, 1.3)
PINK = material('Heart energy', 0xE7A0B9, .12, .28, 1.4)
PURPLE = material('Rift energy', 0xBB9EEA, .12, .28, 1.4)
BLACK = material('Void armor', 0x343447, .66, .38)
HEART_ARMOR = material('Heartguard lacquer', 0x69404E, .5, .42)
STAGE = material('Review plinth', 0x29383C, .3, .65)

current_collection = None
current_root = None

def register(obj, name, mat, parent=None, smooth=False):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    current_collection.objects.link(obj)
    obj.parent = parent or current_root
    if mat:
        obj.data.materials.append(mat)
    if smooth and obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj

def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    current_collection.objects.link(obj)
    obj.parent = parent or current_root
    obj.location = location
    obj.empty_display_size = .12
    return obj

def ellipsoid(name, location, scale, mat, parent=None, faceted=False):
    if faceted:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1)
    obj = register(bpy.context.object, name, mat, parent, not faceted)
    obj.location = location
    obj.scale = scale
    return obj

def block(name, location, size, mat, bevel=.025, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = register(bpy.context.object, name, mat, parent)
    obj.location = location
    for vertex in obj.data.vertices:
        vertex.co.x *= size[0]
        vertex.co.y *= size[1]
        vertex.co.z *= size[2]
    if bevel:
        modifier = obj.modifiers.new('Forged edge bevel', 'BEVEL')
        modifier.width = min(bevel, min(size) * .2)
        modifier.segments = 2
        obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    return obj

def segment(name, a, b, radius, mat, end_radius=None, parent=None, sides=12):
    start, end = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius,
        radius2=radius if end_radius is None else end_radius, depth=(end-start).length)
    obj = register(bpy.context.object, name, mat, parent, True)
    obj.location = (start + end) / 2
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    return obj

def tube(name, points, radius, mat, parent=None, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 8
    data.bevel_depth = radius
    data.bevel_resolution = 1
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, xyz in zip(spline.bezier_points, points):
        point.co = xyz
        point.handle_left_type = point.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    current_collection.objects.link(obj)
    obj.parent = parent or current_root
    data.materials.append(mat)
    return obj

def ring(name, location, radius, thickness, mat, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness,
        major_segments=24, minor_segments=6)
    obj = register(bpy.context.object, name, mat, parent, True)
    obj.location = location
    obj.rotation_euler = rotation
    return obj

def profile(name, rings, mat, sides=16, folds=0, parent=None):
    # Each cross-section: height, half-width, half-depth, front/back offset.
    vertices, faces = [], []
    for z, rx, ry, cy in rings:
        for i in range(sides):
            angle = i * math.tau / sides
            wrinkle = 1 + folds * math.cos(angle*8)
            vertices.append((rx*math.cos(angle)*wrinkle, cy+ry*math.sin(angle)*wrinkle, z))
    for row in range(len(rings)-1):
        for i in range(sides):
            j = (i+1) % sides
            faces.append((row*sides+i, row*sides+j, (row+1)*sides+j, (row+1)*sides+i))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(rings)-1)*sides+i for i in range(sides)))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    return register(bpy.data.objects.new(name, data), name, mat, parent, not folds)

def gem(name, location, scale, mat, parent=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
    obj = register(bpy.context.object, name, mat, parent)
    obj.location = location
    obj.scale = scale
    return obj

def eye_pair(z, y, spacing=.075, glow=AMBER, parent=None):
    for sign in (-1, 1):
        ellipsoid('Inset luminous eye', (sign*spacing, y, z), (.032, .02, .024), glow, parent)

def hood(z, cloth, glow=AMBER, size=1):
    hood = profile('Sewn pointed hood', [
        (z-.27, .16*size, .15*size, .025), (z-.14, .26*size, .21*size, .04),
        (z+.12, .27*size, .24*size, .045), (z+.30, .14*size, .18*size, .07),
        (z+.36, .055*size, .08*size, .11)], cloth, 16)
    ellipsoid('Recessed hood opening', (0, -.205*size, z+.01), (.185*size, .055*size, .225*size), DARK)
    tube('Stitched hood lip', [(-.17*size,-.24*size,z-.13),(-.205*size,-.235*size,z+.06),
        (0,-.245*size,z+.24),(.205*size,-.235*size,z+.06),(.17*size,-.24*size,z-.13)], .018, LEATHER)
    eye_pair(z+.065, -.265*size, glow=glow)
    return hood

def robe(cloth, height=1.3, width=.39):
    profile('Folded robe skirt', [( .11,width,.29,0),(.27,width*.97,.285,0),
        (height*.48,width*.73,.235,0),(height*.75,width*.56,.20,0),
        (height,width*.72,.235,0)], cloth, 32, .065)
    profile('Embroidered hem', [(.105,width*1.025,.302,0),(.16,width*1.012,.30,0)], BRASS, 32)
    for sign in (-1,1):
        tube('Front robe embroidery', [(sign*.15,-.3,.15),(sign*.115,-.235,.60),
            (sign*.1,-.21,1.05)], .012, BRASS)
    block('Waist sash', (0,-.01,.9), (.47,.44,.09), LEATHER)
    gem('Sash clasp',(0,-.255,.91),(.07,.025,.075),BRASS)

def arms(cloth, hands, shoulder_z=1.34):
    for sign, hand in hands:
        shoulder = (sign*.31,0,shoulder_z)
        elbow = (sign*.38,hand[1]*.38,hand[2]+.14)
        ellipsoid('Shoulder fabric',shoulder,(.17,.17,.18),cloth)
        segment('Upper sleeve',shoulder,elbow,.14,cloth,.12)
        segment('Folded sleeve',elbow,hand,.125,cloth,.09)
        ellipsoid('Wrist cuff',hand,(.10,.10,.075),BRASS)
        ellipsoid('Gripping fingers', (hand[0],hand[1]-.025,hand[2]),(.08,.095,.09),BONE)

def breastplate(mat, trim=BRASS, width=.34):
    profile('Contoured breastplate',[(.85,width*.73,.20,0),(1.02,width*.88,.24,0),
        (1.35,width,.265,0),(1.52,width*.87,.20,.01)],mat,12)
    profile('Layered gorget',[(1.5,.20,.17,0),(1.57,.18,.16,0)],trim,12)
    for sign in (-1,1):
        tube('Chest edge trim',[(sign*.22,-.21,.94),(sign*.28,-.25,1.2),
            (sign*.25,-.20,1.44)],.015,trim)
    block('Leather battle belt',(0,0,.87),(.52,.43,.095),LEATHER)
    gem('Battle belt clasp',(0,-.23,.87),(.075,.04,.065),trim)

def legs(mat, trim=STEEL):
    for sign in (-1,1):
        pivot=empty(f'leg-{sign}',(sign*.17,0,.82))
        segment('Armored thigh',(0,0,0),(0,.015,-.31),.13,mat,.105,pivot)
        ellipsoid('Knee guard',(0,-.055,-.34),(.125,.12,.13),trim,pivot,True)
        segment('Shaped greave',(0,.005,-.34),(0,-.02,-.68),.105,mat,.075,pivot)
        ellipsoid('Grounded armored boot',(0,-.09,-.74),(.125,.22,.085),mat,pivot)
        block('Shin ridge',(0,-.105,-.52),(.045,.045,.26),trim,parent=pivot)

def helmet(mat, glow=TEAL, crown=False):
    profile('Faceted war helmet',[(1.57,.18,.17,0),(1.67,.235,.22,0),
        (1.91,.22,.205,.025),(2.025,.14,.14,.035),(2.075,.025,.05,.04)],mat,12)
    block('Deep visor slot',(0,-.217,1.84),(.32,.035,.075),DARK,.008)
    for sign in (-1,1):
        block('Visor soul slit',(sign*.08,-.241,1.84),(.09,.012,.025),glow,.003)
        tube('Helmet cheek ridge',[(sign*.19,-.15,1.94),(sign*.19,-.20,1.77),
            (sign*.105,-.15,1.62)],.016,STEEL)
    if crown:
        for sign in (-1,1):
            segment('Broken crown spike',(sign*.17,0,1.99),(sign*.28,.02,2.27),.075,BRASS,.005)

def sword(name, hand, mat=STEEL, glow=None, length=.9):
    root=empty(name,hand)
    segment('Wrapped sword grip',(0,0,-.10),(0,0,.12),.045,LEATHER,parent=root)
    gem('Sword pommel',(0,0,-.15),(.07,.06,.07),BRASS,root)
    block('Curved crossguard',(0,0,.13),(.38,.085,.055),BRASS,parent=root)
    profile('Tapered diamond sword blade',[(.16,.09,.032,0),(.25,.085,.029,0),
        (.16+length*.82,.065,.024,0),(.16+length,.003,.004,0)],mat,4,parent=root)
    if glow:
        segment('Inlaid blade energy',(0,-.034,.22),(0,-.025,.16+length*.84),.011,glow,parent=root,sides=6)
    return root

def humanoid(kind):
    if kind in ('guard','shield','voidknight','heartguard'):
        mat = STONE if kind=='guard' else BLACK if kind=='voidknight' else HEART_ARMOR if kind=='heartguard' else IRON
        glow = PURPLE if kind=='voidknight' else PINK if kind=='heartguard' else AMBER if kind=='guard' else TEAL
        legs(mat)
        breastplate(mat, width=.37 if kind=='guard' else .32)
        helmet(mat,glow,kind=='voidknight')
        for sign in (-1,1):
            ellipsoid('Overlapping shoulder plate',(sign*.38,0,1.43),(.22,.235,.17),STONE if kind=='guard' else STEEL,faceted=True)
        hands=[(-1,(-.43,-.16,1.06)),(1,(.48,-.16,1.09))]
        arms(mat,hands)
        gem('Socketed chest soul',(0,-.267,1.25),(.08,.045,.115),glow)
        if kind=='shield':
            root=empty('shield',(-.36,-.35,1.02))
            # Six-sided shield with an actual thick rim and central raised boss.
            vertices=[(-.34,0,.48),(.34,0,.48),(.39,0,-.18),(0,0,-.62),(-.39,0,-.18)]
            data=bpy.data.meshes.new('Kite shield surface')
            data.from_pydata(vertices,[],[(0,1,2,3,4)])
            obj=register(bpy.data.objects.new('Kite shield face',data),'Kite shield face',IRON,root)
            mod=obj.modifiers.new('Real shield thickness','SOLIDIFY');mod.thickness=.075
            tube('Shield brass border',vertices,.025,BRASS,root,True)
            gem('Shield soul boss',(0,-.065,.02),(.115,.075,.14),TEAL,root)
            ring('Shield emblem',(0,-.06,.02),.19,.013,BRASS,(math.pi/2,0,0),root)
            segment('Guard spear haft',(.48,-.16,.23),(.48,-.16,1.95),.032,LEATHER)
            gem('Forged spearhead',(.48,-.16,2.10),(.08,.035,.21),STEEL)
        elif kind=='guard':
            segment('Stone poleaxe handle',(.48,-.16,.28),(.48,-.16,2.02),.045,BRASS)
            ellipsoid('Heavy crescent axe blade',(.62,-.16,1.92),(.26,.065,.27),STONE,faceted=True)
            block('Axe edge',(.82,-.16,1.92),(.06,.10,.39),STEEL)
            for sign in (-1,1):
                tube('Stone armor fracture',[(sign*.11,-.275,1.39),(sign*.17,-.277,1.24),
                    (sign*.12,-.26,1.12)],.009,DARK)
        else:
            sword('void-sword' if kind=='voidknight' else 'guardian-sword',(.48,-.16,1.09),STEEL,glow)
            profile('Split armored tabard',[(.50,.22,.24,0),(.83,.25,.23,0)],VIOLET if kind=='voidknight' else ASH,16,.045)
            # Back cloak meets the gorget instead of hanging independently.
            cloak=profile('Heavy shoulder cloak',[(.28,.36,.08,.27),(.8,.29,.06,.26),
                (1.48,.27,.04,.17)],VIOLET if kind=='voidknight' else ASH,16,.07)
        return
    cloth = CLOTH if kind=='archer' else ASH if kind=='ashpriest' else VIOLET if kind=='riftshaman' else LEATHER
    glow = PURPLE if kind=='riftshaman' else AMBER
    robe(cloth)
    hood(1.68,cloth,glow)
    for sign in (-1,1):
        ellipsoid('Boot beneath robe',(sign*.16,-.05,.08),(.115,.20,.08),LEATHER)
    if kind=='archer':
        hands=[(-1,(-.10,-.52,1.1)),(1,(.17,-.29,1.08))]
        arms(cloth,hands)
        bow=empty('bow',(0,-.45,1.18))
        block('Ash crossbow stock',(0,.04,0),(.10,.70,.095),LEATHER,parent=bow)
        tube('Swept crossbow limbs',[(-.50,-.1,0),(-.33,-.25,.025),(0,-.29,.02),
            (.33,-.25,.025),(.50,-.1,0)],.025,BRASS,bow)
        tube('Crossbow tension string',[(-.50,-.1,.018),(0,.24,.035),(.50,-.1,.018)],.006,BONE,bow)
        segment('Ready crossbow bolt',(0,.25,.07),(0,-.38,.07),.011,BONE,parent=bow)
        gem('Bolt head',(0,-.42,.07),(.025,.07,.022),STEEL,bow)
        quiver=segment('Back arrow quiver',(.20,.23,.82),(.20,.23,1.60),.13,LEATHER)
        for x in (.14,.20,.26):
            segment('Stored arrow',(x,.23,1.28),(x,.23,1.80),.01,BONE)
            gem('Arrow feather',(x,.23,1.72),(.04,.018,.09),CLOTH)
    elif kind=='sealcaster':
        arms(cloth,[(-1,(-.24,-.40,1.14)),(1,(.24,-.40,1.14))])
        tablet=empty('seal-tablet',(0,-.44,1.20))
        block('Heavy carved seal tablet',(0,0,0),(.46,.09,.37),SLATE,parent=tablet)
        ring('Carved seal',(0,-.058,.02),.115,.015,BRASS,(math.pi/2,0,0),tablet)
        tube('Seal inscription',[(0,-.075,-.06),(.05,-.075,.02),(0,-.075,.09),(-.05,-.075,.02)],.009,AMBER,tablet,True)
        for sign in (-1,1):
            block('Tablet corner mount',(sign*.215,-.045,0),(.025,.025,.33),BRASS,parent=tablet)
        focus=empty('seal-focus',(0,-.36,1.52))
        ring('Incantation halo',(0,0,0),.15,.008,AMBER,(math.pi/2,0,0),focus)
    else:
        arms(cloth,[(-1,(-.39,-.14,1.12)),(1,(.43,-.14,1.13))])
        staff=empty('rift-staff' if kind=='riftshaman' else 'ash-staff',(.43,-.14,1.13))
        segment('Long wooden staff',(0,0,-1.05),(0,0,.73),.032,LEATHER,parent=staff)
        for z in (-.65,-.45,.2,.57):
            ring('Staff binding',(0,0,z),.04,.012,BRASS,parent=staff)
        for sign in (-1,1):
            tube('Staff socket claw',[(sign*.035,0,.62),(sign*.12,0,.76),
                (sign*.075,0,.99)],.018,BRASS,staff)
        gem('Rift staff crystal' if kind=='riftshaman' else 'Censer ember',(0,0,.82),(.10,.085,.18),glow,staff)
        if kind=='ashpriest':
            ring('Censer suspension',(-.39,-.14,.88),.055,.016,BRASS,(math.pi/2,0,0))
            segment('Censer chain',(-.39,-.14,1.1),(-.39,-.14,.64),.012,BRASS)
            ellipsoid('Perforated censer',(-.39,-.14,.56),(.14,.14,.12),BRASS,faceted=True)
            for i in range(6):
                a=i*math.tau/6
                ellipsoid('Censer ember aperture',(-.39+math.cos(a)*.13,-.14+math.sin(a)*.13,.56),(.02,.02,.035),AMBER)

def rat():
    ellipsoid('Low rodent torso',(0,.07,.31),(.27,.46,.23),STONE,faceted=True)
    ellipsoid('Rat skull',(0,-.37,.36),(.19,.23,.16),PALE,faceted=True)
    ellipsoid('Tapered snout',(0,-.58,.30),(.115,.21,.095),STONE,faceted=True)
    ellipsoid('Dark nose',(0,-.755,.31),(.063,.043,.042),DARK)
    for sign in (-1,1):
        ellipsoid('Stone ear',(sign*.15,-.33,.535),(.11,.055,.13),STONE,faceted=True)
        ellipsoid('Ear hollow',(sign*.15,-.376,.54),(.064,.018,.08),LEATHER)
        ellipsoid('Rat amber eye',(sign*.162,-.48,.39),(.026,.021,.023),AMBER)
        for y in (-.23,.35):
            foot=empty(f'foot-{int(sign>0)*2+int(y>0)}',(sign*.22,y,.20))
            segment('Rat foreleg',(0,0,0),(sign*.01,-.025,-.11),.047,STONE,parent=foot)
            ellipsoid('Rat paw',(sign*.02,-.06,-.155),(.07,.115,.045),PALE,foot)
            for offset in (-.035,0,.035):
                segment('Paw claw',(offset,-.11,-.15),(offset,-.17,-.16),.012,BONE,.004,foot)
    tube('Tapering rat tail',[(0,.46,.26),(.10,.71,.18),(.12,.98,.10),(-.08,1.20,.065)],.025,LEATHER)
    for i in range(3):
        ellipsoid('Overlapping back stone',(0,.24-i*.19,.48),(.23,.14,.07),PALE,faceted=True)

def hound():
    ellipsoid('chain-hound-body',(0,.07,.66),(.26,.57,.28),BLACK,faceted=True)
    ellipsoid('Strong shoulder',(0,-.34,.75),(.30,.30,.34),IRON,faceted=True)
    ellipsoid('Hound neck',(0,-.48,.87),(.23,.22,.29),SLATE,faceted=True)
    ellipsoid('Hound skull',(0,-.67,.97),(.215,.24,.19),BLACK,faceted=True)
    ellipsoid('Long armored snout',(0,-.87,.87),(.15,.25,.11),IRON,faceted=True)
    block('Hound nose',(0,-1.09,.9),(.23,.06,.09),DARK)
    jaw=empty('hound-jaw',(0,-.65,.77))
    ellipsoid('Hinged lower jaw',(0,-.23,0),(.15,.245,.045),PALE,jaw)
    for sign in (-1,1):
        ellipsoid('Predator eye',(sign*.17,-.81,1.025),(.025,.04,.025),AMBER)
        gem('Pointed hound ear',(sign*.18,-.55,1.20),(.075,.105,.18),IRON)
        for y in (-.18,-.35):
            segment('Hound fang',(sign*.12,y,.02),(sign*.12,y,.115),.022,BONE,.002,jaw)
        for y in (-.42,.45):
            foot=empty(f'foot-{int(sign>0)*2+int(y>0)}',(sign*.23,y,.63))
            knee=(sign*.03,.10,-.25) if y>0 else (sign*.02,-.04,-.27)
            segment('Hound muscular leg',(0,0,0),knee,.085,SLATE,.055,foot)
            segment('Hound ankle',knee,(sign*.025,-.02,-.49),.055,IRON,.045,foot)
            ellipsoid('Grounded hound paw',(sign*.025,-.11,-.565),(.095,.16,.065),STEEL,foot)
    ring('hound-collar',(0,-.43,.81),.26,.042,BRASS,(math.pi/2,0,0))
    for sign in (-1,1):
        for i in range(8):
            ring('Interlocking side chain',(sign*.27,-.24+i*.105,.77-.045*math.sin(i*math.pi/7)),
                .047,.01,BRASS,(math.pi/2,0,0) if i%2 else (0,math.pi/2,0))
    for y in (-.05,.16,.36):
        ellipsoid('Segmented back armor',(0,y,.90),(.25,.14,.085),STEEL,faceted=True)
    tube('Whip tail',[(0,.56,.72),(.08,.83,.77),(.10,1.03,.90),(.02,1.16,.92)],.03,SLATE)

def reader():
    block('Carved statue footing',(0,0,.11),(.80,.70,.22),STONE,.05)
    profile('Stone folded robe',[(.23,.32,.28,0),(.8,.27,.23,0),(1.50,.27,.22,0)],STONE,32,.075)
    profile('Stone torso',[(1.25,.25,.22,0),(1.72,.30,.235,0),(1.80,.20,.18,0)],PALE,12)
    hood(2.03,STONE,PINK)
    arms(PALE,[(-1,(-.24,-.41,1.47)),(1,(.24,-.41,1.47))],1.66)
    book=empty('reader-book',(0,-.45,1.50))
    block('Open book leather cover',(0,0,0),(.59,.37,.04),LEATHER,parent=book)
    for sign in (-1,1):
        page=block('Book page block',(sign*.145,0,.035),(.275,.33,.04),BONE,parent=book)
        page.rotation_euler.y=sign*-.13
        for i in range(5):
            segment('Engraved page line',(sign*.06,-.11+i*.045,.07),
                (sign*.24,-.11+i*.045,.09),.003,LEATHER,parent=book,sides=6)
    segment('Book spine',(0,-.17,.025),(0,.17,.025),.018,BRASS,parent=book)
    gem('reader-focus',(0,-.36,1.36),(.07,.055,.10),PINK)
    for sign in (-1,1):
        tube('Carved scripture',[(sign*.14,-.295,.32),(sign*.105,-.24,.8),
            (sign*.13,-.255,1.3)],.012,BRASS)

def watcher():
    profile('Tapering watcher pedestal',[(0,.32,.32,0),(.16,.32,.32,0),
        (.30,.24,.24,0),(.98,.20,.20,0),(1.12,.29,.29,0)],SLATE,8)
    for z in (.16,.97,1.10):
        ring('Pedestal band',(0,0,z),.27 if z!=.97 else .22,.025,BRASS)
    ellipsoid('Floating watcher eyeball',(0,0,1.63),(.35,.30,.35),PALE)
    ellipsoid('Forward teal iris',(0,-.272,1.63),(.205,.065,.205),TEAL)
    ellipsoid('Vertical pupil',(0,-.325,1.63),(.045,.016,.13),DARK)
    for i in range(2):
        root=empty(f'watcher-orbit-{i}',(0,0,1.63))
        ring('Gyroscope hoop',(0,0,0),.48,.023,BRASS,(.45+i*.9,.3,0),root)
    for i in range(6):
        a=i*math.tau/6
        gem('Orbiting anchor',(math.cos(a)*.48,math.sin(a)*.48,1.63),(.06,.06,.085),AMBER)
    gem('Crown of watcher',(0,0,2.06),(.08,.08,.10),BRASS)

def gatekeeper():
    for sign in (-1,1):
        segment('Massive stone thigh',(sign*.40,0,1.28),(sign*.42,.02,.68),.27,STONE,.23)
        ellipsoid('Stone knee',(sign*.42,-.08,.65),(.25,.26,.24),PALE,faceted=True)
        segment('Stone shin',(sign*.42,0,.58),(sign*.43,-.02,.22),.23,SLATE,.21)
        block('Guardian grounded foot',(sign*.43,-.15,.13),(.52,.68,.26),STONE,.06)
    profile('Monolithic shaped torso',[(1.12,.62,.43,0),(1.50,.72,.49,0),
        (2.18,.78,.48,0),(2.62,.63,.39,0)],STONE,10)
    profile('Stone collar',[(2.56,.39,.32,0),(2.73,.35,.30,0)],BRASS,12)
    profile('Carved guardian helm',[(2.73,.43,.33,0),(3.20,.43,.35,0),
        (3.36,.30,.28,0)],PALE,10)
    block('Ancient guardian visor',(0,-.35,3.02),(.55,.05,.09),DARK)
    for sign in (-1,1):
        block('Guardian glowing eye',(sign*.16,-.39,3.03),(.19,.02,.035),AMBER,.005)
        segment('Helm horn',(sign*.29,.03,3.3),(sign*.48,.02,3.62),.12,BRASS,.01)
        ellipsoid('Colossal shoulder',(sign*.82,0,2.36),(.38,.48,.31),PALE,faceted=True)
        segment('Guardian upper arm',(sign*.84,0,2.20),(sign*.97,0,1.70),.25,STONE,.23)
        ellipsoid('Guardian elbow',(sign*.98,-.015,1.68),(.24,.24,.23),BRASS,faceted=True)
        segment('Guardian forearm',(sign*.98,0,1.59),(sign*.98,-.12,1.10),.23,SLATE,.21)
        ellipsoid('Stone fist',(sign*.98,-.14,1.03),(.25,.27,.27),STONE,faceted=True)
        for x in (-.12,0,.12):
            block('Fist finger ridge',(sign*.98+x,-.34,1.03),(.08,.075,.24),PALE)
    ring('Chest core armored bezel',(0,-.49,1.93),.27,.055,BRASS,(math.pi/2,0,0))
    gem('Gatekeeper amber core',(0,-.53,1.93),(.20,.11,.24),AMBER)
    for sign in (-1,1):
        tube('Inlaid guardian rune',[(sign*.48,-.44,2.27),(sign*.38,-.49,2.0),
            (sign*.48,-.47,1.75),(sign*.36,-.43,1.38)],.025,BRASS)
        tube('Chipped stone seam',[(sign*.15,-.35,3.29),(sign*.26,-.37,3.16),
            (sign*.20,-.39,3.09)],.012,DARK)

def chainpriest():
    robe(VIOLET,2.22,.66)
    # Upper vestment has a wide ceremonial mantle and a tall pointed cowl.
    profile('Ceremonial shoulder mantle',[(1.96,.37,.31,0),(2.33,.62,.34,0),
        (2.48,.34,.26,0)],ASH,20,.035)
    hood(2.88,VIOLET,AMBER,1.55)
    arms(VIOLET,[(-1,(-.74,-.10,1.98)),(1,(.74,-.10,1.98))],2.32)
    for sign in (-1,1):
        segment('Connected ceremonial sleeve',(sign*.47,0,2.30),(sign*.74,-.10,1.98),.22,VIOLET,.14)
        for i in range(13):
            ring('Hanging iron chain',(sign*.74,-.10,1.83-i*.10),.055,.012,
                BRASS,(math.pi/2,0,0) if i%2 else (0,math.pi/2,0))
        ellipsoid('Chain censer',(sign*.74,-.10,.48),(.16,.16,.18),IRON,faceted=True)
        gem('Censer fire',(sign*.74,-.22,.48),(.09,.04,.10),AMBER)
        tube('Long embroidered stole',[(sign*.19,-.35,.16),(sign*.15,-.27,1.16),
            (sign*.19,-.35,2.18)],.027,BRASS)
    ring('Ceremonial back halo',(0,.23,2.90),.53,.026,BRASS,(math.pi/2,0,0))
    for i in range(7):
        a=i*math.pi/6
        segment('Halo crown ray',(math.cos(a)*.54,.23,2.9+math.sin(a)*.54),
            (math.cos(a)*.67,.23,2.9+math.sin(a)*.67),.018,BRASS,.006)

def heart():
    profile('Relic altar octagon',[(0,.62,.62,0),(.20,.62,.62,0),(.27,.51,.51,0)],SLATE,8)
    ring('Altar brass perimeter',(0,0,.24),.56,.026,BRASS)
    root=empty('heart-core',(0,0,1.83))
    ellipsoid('Anatomical left heart lobe',(-.21,0,.19),(.34,.29,.38),PINK,root,True)
    ellipsoid('Anatomical right heart lobe',(.19,0,.24),(.31,.28,.32),PINK,root,True)
    gem('Tapered heart ventricle',(0,-.025,-.24),(.44,.30,.57),PINK,root)
    tube('Raised arterial vein',[(-.20,-.27,.42),(-.13,-.32,.16),(.05,-.31,-.08),
        (.10,-.20,-.46)],.021,BRASS,root)
    tube('Ascending aorta',[(0,.08,.44),(.04,.05,.74),(.25,.03,.75),(.28,-.08,.61)],.07,BRASS,root)
    for i in range(3):
        orbit=empty(f'heart-orbit-{i}',(0,0,1.83))
        orbit.rotation_euler=(.5+i*.8,.25+i*.5,.12)
        ring('Armillary relic band',(0,0,0),.94,.028,BRASS,parent=orbit)
        for a in (0,math.pi):
            gem('Armillary band crystal',(math.cos(a)*.94,math.sin(a)*.94,0),(.065,.065,.14),PURPLE,orbit)
    for sign in (-1,1):
        gem('Axial crown crystal',(0,0,1.83+sign*1.35),(.14,.14,.24),BRASS)
        segment('Axial crown shaft',(0,0,1.83+sign*.73),(0,0,1.83+sign*1.25),.023,BRASS)
    for i in range(4):
        a=i*math.tau/4
        gem('Altar corner stone',(math.cos(a)*.40,math.sin(a)*.40,.34),(.11,.11,.15),PURPLE)

KINDS=[
    ('rat','돌쥐','STONE RAT',.72),('archer','금 간 궁수','CRACKED ARCHER',1.84),
    ('guard','돌진 파수꾼','CHARGING WARDEN',2.08),('shield','방패 망령','SHIELD WRAITH',1.92),
    ('ashpriest','재의 사제','ASH PRIEST',1.92),('watcher','궤도 감시자','ORBIT WATCHER',2.16),
    ('heartguard','심장 수호병','HEART GUARD',2.24),('riftshaman','균열 주술사','RIFT SHAMAN',2.0),
    ('voidknight','공허 기사','VOID KNIGHT',2.32),('sealcaster','봉인술사','SEAL CASTER',2.0),
    ('chainhound','사슬 사냥개','CHAIN HOUND',1.12),('readerstatue','독서 석상','READER STATUE',2.40),
    ('gatekeeper','문지기','GATEKEEPER',3.68),('chainpriest','사슬 사제','CHAIN PRIEST',3.36),
    ('relicheart','유물 심장','RELIC HEART',3.6),
]
BUILDERS={'rat':rat,'chainhound':hound,'readerstatue':reader,'watcher':watcher,
    'gatekeeper':gatekeeper,'chainpriest':chainpriest,'relicheart':heart}
report=[]
roots=[]

for index,(kind,korean,label,target_height) in enumerate(KINDS):
    current_collection=bpy.data.collections.new(f'{index+1:02d} | {korean} | {kind}')
    bpy.context.scene.collection.children.link(current_collection)
    current_root=None
    current_root=empty(kind)
    current_root['kind']=kind
    current_root['display_name']=korean
    current_root['review_status']='AWAITING_USER_REVIEW'
    current_root['game_applied']=False
    current_root['front_axis']='-Y (Blender), +Z after glTF export'
    BUILDERS.get(kind,lambda:humanoid(kind))()
    bpy.context.view_layer.update()
    # Measure evaluated geometry, including bevels and curves, then set feet to zero.
    depsgraph=bpy.context.evaluated_depsgraph_get()
    points=[]
    vertices=triangles=0
    for obj in current_collection.objects:
        if obj.type not in ('MESH','CURVE'):continue
        evaluated=obj.evaluated_get(depsgraph)
        mesh=evaluated.to_mesh()
        points.extend(evaluated.matrix_world@v.co for v in mesh.vertices)
        vertices+=len(mesh.vertices)
        triangles+=sum(len(p.vertices)-2 for p in mesh.polygons)
        evaluated.to_mesh_clear()
    lo=Vector(tuple(min(p[a] for p in points) for a in range(3)))
    hi=Vector(tuple(max(p[a] for p in points) for a in range(3)))
    factor=target_height/(hi.z-lo.z)
    current_root.scale=(factor,)*3
    x=(index%5-2)*3.15
    y=(index//5)*5.4
    current_root.location=(x,y,-lo.z*factor+.12)
    roots.append(current_root)
    report.append({'kind':kind,'name':korean,'height':target_height,
        'width':(hi.x-lo.x)*factor,'depth':(hi.y-lo.y)*factor,
        'vertices':vertices,'triangles':triangles,'review_status':'awaiting_user_review',
        'game_applied':False})
    print(f'MODEL_READY {kind} {vertices} vertices {triangles} triangles',flush=True)

# One dedicated collection holds the review furniture and cameras.
current_collection=bpy.data.collections.new('00 | REVIEW STUDIO')
bpy.context.scene.collection.children.link(current_collection)
current_root=None
for index,(_,_,label,_) in enumerate(KINDS):
    x,y=roots[index].location.x,roots[index].location.y
    block('Model review plinth',(x,y,.055),(2.8,2.8,.11),STAGE,.03)
    data=bpy.data.curves.new(label,'FONT')
    data.body=f'{index+1:02d}  {label}'
    data.size=.14
    data.align_x='CENTER'
    data.extrude=.001
    obj=bpy.data.objects.new(label,data)
    current_collection.objects.link(obj)
    obj.location=(x,y-1.25,.122)
    data.materials.append(BONE)

floor=block('Review studio floor',(0,5.4,-.045),(21,20,.05),material('Studio floor',0x192A30),0)
def camera(name,location,target,scale):
    bpy.ops.object.camera_add(location=location)
    obj=register(bpy.context.object,name,None)
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    obj.data.type='ORTHO'
    obj.data.ortho_scale=scale
    obj.data.lens=50
    return obj

overview=camera('00 | All 15 monsters',(9,-19,17),(0,4.9,1.15),23)
row_cameras=[]
for row in range(3):
    y=row*5.4
    row_cameras.append(camera(f'0{row+1} | Row {row+1}',(2.0,y-12,7.0),(0,y,1.35),16.6))
for index,(kind,_,_,height) in enumerate(KINDS):
    pos=roots[index].location
    camera(f'{index+4:02d} | {kind} closeup',(pos.x+3.5,pos.y-6,2.8+height*.3),
        (pos.x,pos.y,height*.48),max(2.0,height*1.34))

for name,location,target,energy,color,size in [
    ('Warm studio key',(-6,-4,12),(0,5,1),4200,(1,.85,.70),10),
    ('Cool studio fill',(7,-1,9),(0,5,1),3200,(.68,.86,1),8),
    ('Rear rim',(0,15,10),(0,5,1),4500,(.71,1,.9),9),
]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=register(bpy.context.object,name,None)
    light.data.energy=energy;light.data.color=color;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()

scene=bpy.context.scene
scene.name='Monster review | pending approval'
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1800
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(.12,.12,.12)
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.17,.21,.25,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
scene.view_settings.view_transform='AgX'
scene.camera=overview
scene['review_status']='AWAITING_USER_APPROVAL_BEFORE_GAME_INTEGRATION'
for obj in bpy.context.selected_objects:obj.select_set(False)
bpy.context.view_layer.objects.active=None
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.shading.type='SOLID'
            space.shading.color_type='MATERIAL'
            space.shading.light='STUDIO'
            space.shading.show_shadows=True
            space.shading.show_cavity=True
            space.shading.cavity_type='BOTH'
            space.overlay.show_overlays=False
            space.region_3d.view_location=Vector((0,4.9,1.15))
            space.region_3d.view_rotation=overview.rotation_euler.to_quaternion()
            space.region_3d.view_distance=22
            space.region_3d.view_perspective='ORTHO'

# Keep a concise review manifest alongside the editable file.
(OUT/'monster-manifest.json').write_text(json.dumps({'status':'awaiting_user_review',
    'game_applied':False,'models':report},ensure_ascii=False,indent=2),encoding='utf-8')
blend=OUT/'monsters-review.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
print(f'BLEND_SAVED {blend}',flush=True)

# Render the actual geometry, not generated concept images.
scene.render.filepath=str(OUT/'all-monsters.png')
bpy.ops.render.render(write_still=True)
for row,cam in enumerate(row_cameras):
    for index,root in enumerate(roots):
        for collection in root.users_collection:
            collection.hide_render = index // 5 != row
    for obj in current_collection.objects:
        if obj.name.startswith('Model review plinth') or obj.type == 'FONT':
            obj.hide_render = abs(obj.location.y - row*5.4) > 1.5
    scene.camera=cam
    scene.render.resolution_x=1800;scene.render.resolution_y=680
    scene.render.filepath=str(OUT/f'monsters-row-{row+1}.png')
    bpy.ops.render.render(write_still=True)
for collection in scene.collection.children:
    collection.hide_render=False
for obj in current_collection.objects:
    obj.hide_render=False
scene.camera=overview
scene.render.resolution_x=1800;scene.render.resolution_y=1100
print('REVIEW_RENDERS_READY',flush=True)
