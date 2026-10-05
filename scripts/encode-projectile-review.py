"""Encode and verify the projectile review's four-second motion loop."""
from pathlib import Path
from PIL import Image

folder=Path(__file__).resolve().parents[1]/'art/projectile-review'
paths=sorted((folder/'motion-frames').glob('frame-*.png'))
assert len(paths)==48, f'Expected 48 frames, found {len(paths)}'
palette=Image.open(paths[0]).convert('RGB').quantize(colors=256)
frames=[Image.open(p).convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for p in paths]
output=folder/'projectiles-motion.gif'
frames[0].save(output,save_all=True,append_images=frames[1:],duration=[80,80,90]*16,
    loop=0,disposal=2,optimize=True)
with Image.open(output) as result:
    assert result.n_frames==48
    total=0
    for i in range(result.n_frames):
        result.seek(i);total+=result.info['duration']
    assert total==4000
    print(f'PROJECTILE_GIF_VERIFIED | {result.n_frames} frames | {total} ms | {output.stat().st_size} bytes')
