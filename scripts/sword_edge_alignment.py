"""Measure a sword's cutting edge against its actual animated swing tangent."""
import math
from mathutils import Vector, Quaternion

SWORDS={'heartguard':'guardian-sword','voidknight':'void-sword'}

def sword_for(scene,kind):
    root=scene.objects[kind]
    return next(obj for obj in root.users_collection[0].objects
        if obj.name.split('.')[0]==SWORDS[kind])

def strike_windows(kind):
    intervals=[(.38,.48)] if kind=='voidknight' else [(.38/2,.48/2),(.48+.52*.38,.48+.52*.48)]
    return [(121+71*a,121+71*b) for a,b in intervals]

def set_frame(scene,value):
    whole=math.floor(value)
    scene.frame_set(whole,subframe=value-whole)

def tangent(scene,sword,frame):
    center=Vector((0,0,.70))
    set_frame(scene,frame-.25);before=sword.matrix_world@center
    set_frame(scene,frame+.25);after=sword.matrix_world@center
    set_frame(scene,frame)
    velocity=after-before
    longitudinal=(sword.matrix_world.to_3x3()@Vector((0,0,1))).normalized()
    transverse=velocity-longitudinal*velocity.dot(longitudinal)
    return transverse.normalized() if transverse.length>1e-7 else None

def audit(scene,kind):
    sword=sword_for(scene,kind)
    rows=[]
    for start,end in strike_windows(kind):
        for i in range(math.ceil(start),math.floor(end)+1):
            direction=tangent(scene,sword,i)
            if direction is None:continue
            edge=(sword.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
            face=(sword.matrix_world.to_3x3()@Vector((0,1,0))).normalized()
            rows.append({'frame':i,'edge_alignment':abs(edge.dot(direction)),
                'flat_face_alignment':abs(face.dot(direction))})
    return {'kind':kind,'samples':rows,'minimum_edge_alignment':min(r['edge_alignment'] for r in rows),
        'mean_edge_alignment':sum(r['edge_alignment'] for r in rows)/len(rows),
        'maximum_flat_face_alignment':max(r['flat_face_alignment'] for r in rows)}

def smooth(t):
    t=max(0,min(1,t))
    return t*t*(3-2*t)

def align_edges(scene):
    """Roll the held sword about its length, without changing the swing path.

    The sword is double edged along local ±X; the broad faces are local ±Y.
    Sample the authored trajectory before inserting keys so new keys cannot
    feed back into the orientation calculation. Each strike has its own roll.
    """
    results=[]
    for kind in SWORDS:
        sword=sword_for(scene,kind)
        before=audit(scene,kind)
        scene.frame_set(121)
        rest=sword.rotation_euler.copy()
        rest_quat=rest.to_quaternion()
        windows=strike_windows(kind)
        segments=[]
        for strike_index,(start,end) in enumerate(windows):
            # Double edges allow equivalent rolls separated by pi; keep the
            # shortest continuous hand rotation through each release.
            angles=[]
            for i in range(math.floor(start*2),math.ceil(end*2)+1):
                frame=i/2
                direction=tangent(scene,sword,frame)
                local=sword.matrix_world.to_3x3().inverted()@direction
                angle=math.atan2(local.y,local.x)
                anchor=angles[-1][1] if angles else 0
                while angle-anchor>math.pi/2:angle-=math.pi
                while angle-anchor<-math.pi/2:angle+=math.pi
                angles.append((frame,angle))
            prepare=121 if strike_index==0 else 121+71*.48
            recover=121+71*.91 if kind=='voidknight' else (
                121+71*.91/2 if strike_index==0 else 121+71*(.48+.52*.91))
            segments.append((prepare,start,end,recover,angles))
        # Every channel preceding the attack and following it remains at rest.
        for frame in (1,120,193,240,241):
            sword.rotation_euler=rest
            sword.keyframe_insert(data_path='rotation_euler',frame=frame,group='Cutting edge alignment')
        for half in range(242,387):
            frame=half/2
            angle=0
            for prepare,start,end,recover,angles in segments:
                if prepare<=frame<=recover:
                    if frame<start:
                        angle=angles[0][1]*smooth((frame-prepare)/(start-prepare))
                    elif frame>end:
                        angle=angles[-1][1]*(1-smooth((frame-end)/(recover-end)))
                    else:
                        lower=max(0,min(len(angles)-2,math.floor((frame-angles[0][0])*2)))
                        a,b=angles[lower],angles[lower+1]
                        weight=(frame-a[0])/(b[0]-a[0])
                        angle=a[1]+(b[1]-a[1])*weight
                    break
            sword.rotation_euler=(rest_quat@Quaternion(Vector((0,0,1)),angle)).to_euler('XYZ')
            sword.keyframe_insert(data_path='rotation_euler',frame=frame,group='Cutting edge alignment')
        sword['cutting_edge_axis']='local ±X; aligned to transverse strike velocity'
        sword['edge_alignment_fixed']=True
        after=audit(scene,kind)
        if after['minimum_edge_alignment']<.985 or after['maximum_flat_face_alignment']>.17:
            raise RuntimeError(f'Cutting edge misaligned: {kind}: {after}')
        results.append({'kind':kind,'before':before,'after':after})
        print('SWORD_EDGE_VERIFIED',kind,round(after['minimum_edge_alignment'],5),flush=True)
    scene.frame_set(1)
    return results
