// Real photo textures (bundled as data URLs). Imported by the app entry and by the test harness – never by the node CI.
// Detail photos (luminance only): Pexels (free licence) – rock: Alfo Medeiros, bark: Marina Leonova, sand: Alejandro Henriquez, soil: Engin Akyurt.
// Session 20 – full PBR sets (albedo / normal / AO-roughness-height, 1024²), all CC0: Poly Haven (polyhaven.com) and ambientCG (ambientcg.com).
// Regenerate with `python3 tools/photos/pbr.py` (list of sources inside).
import rock from '../assets/tex/rock.jpg';
import bark from '../assets/tex/bark.jpg';
import sand from '../assets/tex/sand.jpg';
import soil from '../assets/tex/soil.jpg';
import { registerPhotos } from './photoTex';
import { registerPbr, type PbrUrls } from './pbrTex';
import sand_c from '../assets/pbr/sand_c.jpg';
import sand_n from '../assets/pbr/sand_n.jpg';
import sand_p from '../assets/pbr/sand_p.jpg';
import rock_c from '../assets/pbr/rock_c.jpg';
import rock_n from '../assets/pbr/rock_n.jpg';
import rock_p from '../assets/pbr/rock_p.jpg';
import cliff_c from '../assets/pbr/cliff_c.jpg';
import cliff_n from '../assets/pbr/cliff_n.jpg';
import cliff_p from '../assets/pbr/cliff_p.jpg';
import cracked_c from '../assets/pbr/cracked_c.jpg';
import cracked_n from '../assets/pbr/cracked_n.jpg';
import cracked_p from '../assets/pbr/cracked_p.jpg';
import snow_c from '../assets/pbr/snow_c.jpg';
import snow_n from '../assets/pbr/snow_n.jpg';
import snow_p from '../assets/pbr/snow_p.jpg';
import powder_c from '../assets/pbr/powder_c.jpg';
import powder_n from '../assets/pbr/powder_n.jpg';
import powder_p from '../assets/pbr/powder_p.jpg';
import ice_c from '../assets/pbr/ice_c.jpg';
import ice_n from '../assets/pbr/ice_n.jpg';
import ice_p from '../assets/pbr/ice_p.jpg';
import lava_c from '../assets/pbr/lava_c.jpg';
import lava_n from '../assets/pbr/lava_n.jpg';
import lava_p from '../assets/pbr/lava_p.jpg';
import lava_e from '../assets/pbr/lava_e.jpg';
import ash_c from '../assets/pbr/ash_c.jpg';
import ash_n from '../assets/pbr/ash_n.jpg';
import ash_p from '../assets/pbr/ash_p.jpg';
import regolith_c from '../assets/pbr/regolith_c.jpg';
import regolith_n from '../assets/pbr/regolith_n.jpg';
import regolith_p from '../assets/pbr/regolith_p.jpg';
import mud_c from '../assets/pbr/mud_c.jpg';
import mud_n from '../assets/pbr/mud_n.jpg';
import mud_p from '../assets/pbr/mud_p.jpg';
import soil_c from '../assets/pbr/soil_c.jpg';
import soil_n from '../assets/pbr/soil_n.jpg';
import soil_p from '../assets/pbr/soil_p.jpg';
import gravel_c from '../assets/pbr/gravel_c.jpg';
import gravel_n from '../assets/pbr/gravel_n.jpg';
import gravel_p from '../assets/pbr/gravel_p.jpg';
import plate_c from '../assets/pbr/plate_c.jpg';
import plate_n from '../assets/pbr/plate_n.jpg';
import plate_p from '../assets/pbr/plate_p.jpg';
import reef_c from '../assets/pbr/reef_c.jpg';
import reef_n from '../assets/pbr/reef_n.jpg';
import reef_p from '../assets/pbr/reef_p.jpg';

const PBR: Record<string, PbrUrls> = {
  sand: { c: sand_c, n: sand_n, p: sand_p },
  rock: { c: rock_c, n: rock_n, p: rock_p },
  cliff: { c: cliff_c, n: cliff_n, p: cliff_p },
  cracked: { c: cracked_c, n: cracked_n, p: cracked_p },
  snow: { c: snow_c, n: snow_n, p: snow_p },
  powder: { c: powder_c, n: powder_n, p: powder_p },
  ice: { c: ice_c, n: ice_n, p: ice_p },
  lava: { c: lava_c, n: lava_n, p: lava_p, e: lava_e },
  ash: { c: ash_c, n: ash_n, p: ash_p },
  regolith: { c: regolith_c, n: regolith_n, p: regolith_p },
  mud: { c: mud_c, n: mud_n, p: mud_p },
  soil: { c: soil_c, n: soil_n, p: soil_p },
  gravel: { c: gravel_c, n: gravel_n, p: gravel_p },
  plate: { c: plate_c, n: plate_n, p: plate_p },
  reef: { c: reef_c, n: reef_n, p: reef_p },
};

export const loadPhotoTextures = () => { registerPbr(PBR); return registerPhotos({ rock, bark, sand, soil }); };
