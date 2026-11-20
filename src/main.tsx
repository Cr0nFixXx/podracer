import TexWorker from './game/texWorker?worker&inline';
import { setTextureCacheEnabled, setTextureWorkerFactory } from './game/textures';
import { loadPhotoTextures } from './game/photoAssets';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Procedural textures are synthesised in parallel Web Workers (inlined into the single-file build)
if (!location.search.includes('noworkers')) setTextureWorkerFactory(() => new TexWorker()); // ?noworkers = main-thread fallback (for measuring)
setTextureCacheEnabled(!location.search.includes('nocache')); // persistent texture cache (IndexedDB)
void loadPhotoTextures(); // real photo detail textures (rock, bark, sand, soil)
