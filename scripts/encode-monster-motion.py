"""Encode Blender's rendered frames into a looping review GIF."""
from pathlib import Path
import argparse
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--combat', action='store_true')
args = parser.parse_args()
folder = Path(__file__).resolve().parents[1] / 'art' / 'monster-review'
paths = sorted((folder / ('combat-frames' if args.combat else 'motion-frames')).glob('frame-*.png'))
if len(paths) != 60:
    raise RuntimeError(f'Expected 60 motion frames, got {len(paths)}')
palette = Image.open(paths[0]).convert('RGB').quantize(colors=256)
frames = [Image.open(path).convert('RGB').quantize(palette=palette,
    dither=Image.Dither.NONE) for path in paths]
output = folder / ('monsters-combat.gif' if args.combat else 'monsters-motion.gif')
frames[0].save(output, save_all=True, append_images=frames[1:], loop=0,
    duration=[80, 80, 90] * 20, disposal=2, optimize=True)
with Image.open(output) as check:
    if check.n_frames != 60:
        raise RuntimeError(f'GIF lost animation frames: {check.n_frames}')
    print(f'MOTION_GIF_READY {output} | {check.n_frames} frames | {output.stat().st_size} bytes')
