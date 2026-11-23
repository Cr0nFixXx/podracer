#!/usr/bin/env python3
"""Session 20 – downloads CC0 PBR texture sets (Poly Haven / ambientCG) and converts them to the game's compact format.

Usage:  python3 tools/photos/pbr.py            (all sets below → src/assets/pbr/<name>_{c,n,p}.jpg, plus <name>_e.jpg for lava)
        python3 tools/photos/pbr.py sand snow  (only these)
Needs Python 3 + Pillow and internet access. Downloads are cached in /tmp/pbr.

Per set (1024² unless SIZE is changed):
  <name>_c.jpg  albedo (sRGB)                        JPEG q84
  <name>_n.jpg  tangent-space normal map (OpenGL)    JPEG q80, 4:4:4
  <name>_p.jpg  R = ambient occlusion, G = roughness, B = height, 512²   JPEG q82, 4:4:4
  <name>_e.jpg  emission (lava only), 512²
The game (src/game/pbrTex.ts) packs them into its TexSet layout at load time and grades the albedo to the world palette.
"""
import io, json, os, sys, urllib.request, zipfile
from PIL import Image

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'pbr')
CACHE = '/tmp/pbr'
# name → (source, asset id)   – all CC0 (Poly Haven: polyhaven.com/license, ambientCG: docs.ambientcg.com/license)
SETS = {
    'sand':     ('ph', 'aerial_beach_01'),      # wind-rippled sand: dunes, beaches
    'rock':     ('ph', 'sandstone_cracks'),     # slickrock / plateau rock floor
    'cliff':    ('ph', 'cliff_side'),           # stratified cliff: canyon walls, caves
    'cracked':  ('ph', 'mud_cracked_dry_03'),   # dry cracked pan: plateaus, salt flats
    'snow':     ('acg', 'Snow010A'),            # clean packed snow (2026-11-23; before: Poly Haven snow_02 – dark dents that read as footprints, repeated every tile)
    'powder':   ('acg', 'Snow008A'),            # wind-sculpted powder snow (2026-11-23; before: Poly Haven snow_01 – boot prints all over)
    'ice':      ('acg', 'Ice003'),              # glacier / lake ice
    'lava':     ('acg', 'Lava001'),             # dark lava crust with glowing cracks (emission map)
    'ash':      ('ph', 'burned_ground_01'),     # ash / basalt ground
    'regolith': ('ph', 'moon_02'),              # lunar regolith
    'mud':      ('ph', 'brown_mud_02'),         # mud
    'soil':     ('ph', 'forest_floor'),         # jungle floor
    'gravel':   ('ph', 'river_small_rocks'),    # gravel / river bed
    'plate':    ('ph', 'metal_plate_02'),       # metal deck plates
    'reef':     ('ph', 'coast_land_rocks_01'),  # reef / coastal rock
}

def get(url):
    fn = os.path.join(CACHE, url.split('/')[-1].split('?')[0].replace('get', 'get_' + url.split('file=')[-1]))
    if not os.path.exists(fn) or os.path.getsize(fn) < 1000:
        req = urllib.request.Request(url, headers={'User-Agent': 'podracer-texture-fetch/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r, open(fn, 'wb') as f: f.write(r.read())
    return fn

def load_ph(aid):
    files = json.load(open(get(f'https://api.polyhaven.com/files/{aid}')))
    def m(*keys):
        for k in keys:
            if k in files and '1k' in files[k]:
                e = files[k]['1k']; e = e.get('jpg') or e.get('png')
                if e: return Image.open(get(e['url']))
        return None
    return dict(c=m('Diffuse', 'diff'), n=m('nor_gl'), r=m('Rough', 'rough'), h=m('Displacement', 'disp'), ao=m('AO', 'ao'), e=None, arm=m('arm'))

def load_acg(aid):
    z = zipfile.ZipFile(get(f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'))
    def m(suffix):
        for nme in z.namelist():
            if nme.lower().endswith(f'_{suffix}.jpg'.lower()): return Image.open(io.BytesIO(z.read(nme)))
        return None
    return dict(c=m('Color'), n=m('NormalGL'), r=m('Roughness'), h=m('Displacement'), ao=m('AmbientOcclusion'), e=m('Emission'), arm=None)

def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
    total = 0
    for name, (src, aid) in SETS.items():
        if len(sys.argv) > 1 and name not in sys.argv[1:]: continue
        d = (load_ph if src == 'ph' else load_acg)(aid)
        c = d['c'].convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        n = d['n'].convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        g = lambda im, fill: (im.convert('L') if im is not None else Image.new('L', (512, 512), fill)).resize((512, 512), Image.LANCZOS)
        ao, r, h = g(d['ao'], 255), g(d['r'], 200), g(d['h'], 128)
        if d['arm'] is not None and d['ao'] is None: ao = d['arm'].convert('RGB').split()[0].resize((512, 512), Image.LANCZOS)
        if d['arm'] is not None and d['r'] is None: r = d['arm'].convert('RGB').split()[1].resize((512, 512), Image.LANCZOS)
        p = Image.merge('RGB', (ao, r, h))
        sizes = []
        def save(im, suffix, q, sub):
            fn = os.path.join(OUT, f'{name}_{suffix}.jpg'); im.save(fn, 'JPEG', quality=q, subsampling=sub, optimize=True); sizes.append(os.path.getsize(fn))
        save(c, 'c', 84, 2); save(n, 'n', 80, 0); save(p, 'p', 82, 0)
        if d['e'] is not None: save(d['e'].convert('RGB').resize((512, 512), Image.LANCZOS), 'e', 85, 2)
        total += sum(sizes)
        print(f'{name:9s} {src}:{aid:22s} ' + ' '.join(f'{s // 1024:4d}K' for s in sizes))
    print(f'total {total / 1e6:.2f} MB (base64 in the build: {total * 4 / 3 / 1e6:.2f} MB)')

if __name__ == '__main__': main()
