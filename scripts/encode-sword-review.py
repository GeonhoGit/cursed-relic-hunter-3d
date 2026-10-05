from pathlib import Path
from PIL import Image
folder=Path(__file__).resolve().parents[1]/'art/monster-review'
paths=sorted((folder/'sword-frames').glob('frame-*.png'))
assert len(paths)==36
palette=Image.open(paths[0]).convert('RGB').quantize(colors=256)
frames=[Image.open(p).convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for p in paths]
output=folder/'swords-edge-fixed.gif'
frames[0].save(output,save_all=True,append_images=frames[1:],duration=[80,80,90]*12,
    loop=0,disposal=2,optimize=True)
with Image.open(output) as check:
    assert check.n_frames==36
    print('SWORD_GIF_VERIFIED',check.n_frames,output.stat().st_size,flush=True)
