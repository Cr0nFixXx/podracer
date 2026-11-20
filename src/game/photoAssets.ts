// Real photo textures (bundled as data URLs). Imported by the app entry and by the test harness – never by the node CI.
// Photos: Pexels (free licence) – rock: Alfo Medeiros, bark: Marina Leonova, sand: Alejandro Henriquez, soil: Engin Akyurt.
import rock from '../assets/tex/rock.jpg';
import bark from '../assets/tex/bark.jpg';
import sand from '../assets/tex/sand.jpg';
import soil from '../assets/tex/soil.jpg';
import { registerPhotos } from './photoTex';

export const loadPhotoTextures = () => registerPhotos({ rock, bark, sand, soil });
