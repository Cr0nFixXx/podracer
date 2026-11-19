import TexWorker from './game/texWorker?worker&inline';
import { setTextureWorkerFactory } from './game/textures';
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
