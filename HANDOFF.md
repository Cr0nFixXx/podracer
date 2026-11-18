# HANDOFF

## Stand: 2026-11-17 (Session 8) – Start-Lag, Grafikfehler, Sicht, Hindernisse & aktive Triebwerks-Aufhängung

### Erledigt in Session 8
1. **Rennstart-Lag beseitigt (`post.ts`, `Game.ts`, `particles.ts`, `podMaterials.ts`, `podModel.ts`, `trackMesh.ts`, `RaceView.tsx`)**
   - **Ursache 1 – Fehlende Pipeline-Vorkompilierung:** `r.compileAsync(scene, cam)` kompilierte fürs Canvas-Format statt für den `HalfFloat`-`scenePass` (+ Schatten + PostFX + Partikel + Pod-Fern-LOD) → alle Pipelines kompilierten erst mitten im Countdown/Start. **Fix:** `post.warmup(renderer)` kompiliert `scenePass.compileAsync`, rendert 2 komplette Frames (inkl. Seed-Partikeln & beiden Pod-LODs) und wartet auf `queue.onSubmittedWorkDone()` noch hinter dem Ladescreen.
   - **Ursache 2 – Fullscreen-Partikel-Overdraw an der Kamera:** `PointsNodeMaterial` teilte durch `-positionView.z` ohne Obergrenze → Abgas-/Staub-/Wetterpartikel vor/an der Verfolgerkamera wurden zu 4K-Vollbild-Quads. **Fix:** `sizeNode` auf `≤ 14–16 %` Bildhöhe gedeckelt, `0` für `vz < 1,2 m`, weicher Nah-Fade, keine Abgas-Spawns im Countdown.
   - **Ursache 3 – 64 einzelne Pod-Shader-Pipelines am Start:** Gegner-Lack, -Flammen, -Binder & -Glow laufen jetzt über **je 1 geteilte Pipeline** mit gebackenen Vertex-Farben (**64 → 11 TSL-Pipelines, 120 → 31 Materialien** für 11 Pods am Start).
   - **Ursache 4 – PostFX, Schatten & HUD-Filter:** `BloomNode.setResolutionScale(0.5)` (−75 % Fillrate), Schattenkarte `[0, 1024, 1536, 2048]` auf ±96 m, Ultra-SSR standardmäßig aus (optional zuschaltbar), 40-px-CSS-`drop-shadow` im 3-2-1-Countdown durch 0-ms-`textShadow` ersetzt, `smoke.ts` mit `macroTexture` statt 3D-Perlin.

2. **Restliche Grafikfehler behoben (`post.ts`, `trackMesh.ts`, `materials.ts`, `terrainMaterial.ts`, `world.ts`, `groundCover.ts`, `trackDetail.ts`)**
   - **AO & God Rays:** `depth.sample()` in nicht-uniformem `If`/`Loop` und `GTAONode`-Artefakte ersetzt durch 4-Paar-symmetrisches Depth-AO + 14-Tap-God-Rays per ableitungsfreiem `textureLoad` (0 WGSL-Uniformity-Fehler, 0 Halos, 0 Streifen auf Ebenen, immun gegen Partikel/Gras). SSR-Composite zu 100 % in uniformem Control-Flow.
   - **`StaticBatcher` (`trackMesh.ts`):** `BatchedMesh` (mit geteilter `_indirectTexture` zwischen Schatten- und Kamerapass) ersetzt durch räumlich gemergte 580-m-`THREE.Mesh`-Kacheln (0 `BatchedMesh`, unabhängiges Frustum-Culling, 0 Textur-Uploads/Frame).
   - **Naht- & TBN-Fixes:** `displace = 0` auf `wallMat` und Kanten-Lock (`uv.x = 0/1`) auf `roadMat` (keine Risse an Straßenkanten/Klippen/Tunneln); 128×-vorskalierter TBN + Silhouetten-Sprungschutz in `materials.ts`/`podMaterials.ts`; singularitätsfreies `xzNormalToView` + `polygonOffset` auf Wasser/Lava; überschneidungsfreier Kuppel-LOD für ferne Büsche; Moiré-freies Energiefeld.

3. **Weniger & klar erkennbare Streckenhindernisse (`trackBuilder.ts`, `world.ts`)**
   - Hindernisanzahl um **~55 % gesenkt** (Ø **7,5 statt ~17** pro Strecke), Mindestabstand **≥ 52 m**, Freihaltezone vor Rampen und Landezonen (`-68..+42` Samples für Set-Pieces), nur 1 Säule in Abkürzungstunneln.
   - Jedes Hindernis trägt jetzt einen leuchtenden Boden-Warnring, gelb-schwarze Warnstreifen (Kisten) bzw. mehrere Leuchtringe (Säulen) und eine hohe orange-rote Warnbake auf der Spitze (auch auf jedem Felsbrocken).

4. **Klare Sicht hinter Vordermännern (`particles.ts`, `Game.ts`)**
   - Kein grauer Rauch mehr aus intakten Triebwerken; Bodenstaub flach (`vy < 0,9`), klein (`≤ 3,2 m`), dezent (`alpha ≤ 0,06`) und bei Gegnern unter 24 m vor der Kamera komplett unterdrückt; Schadensrauch auf `alpha ≤ 0,16` (Gegner `× 0,32`) gedämpft + Kamera-Nahfade ab 12 m.

5. **5-Punkt-Bodenkollision & dynamische Triebwerks-Aufhängung (`physics.ts`, `podModel.ts`, `podMaterials.ts`, `podDesigns.ts`, `trackBuilder.ts`, `PodPreview.tsx`)**
   - Flughöhe `HOVER = 2,85 m`, exakte Straßenwölbung (`crown` + Randlippe) in `frameAt`/`roadSurfaceAt`, Längsneigung folgt realer Straßen-/Rampensteigung, harte 5-Punkt-Repulsor-Kollision (`MIN_ROAD_CLEAR = 0,68 m`) für linkes/rechtes Triebwerk (vorn/hinten inkl. Flügel) und Cockpit.
   - Beim Lenken & Luftbremsen schwingen linkes und rechtes Triebwerk per Feder-Dämpfer (`ω = 11,5, ζ = 0,66`) dynamisch gegengleich auf und ab (**0,99–1,78 m Hub**, Außentriebwerk steigt & hebt die Nase, Innentriebwerk taucht in den Scheitelpunkt) – bei Spieler **und** Gegnern, inkl. diagonal mitziehendem Energie-Binder und GPU-biegsamen Steuerseilen (`cableFlexMaterial`).
   - **Verifiziert:** alle 10 Pods im Extrem-Slalom + Luftbremse + Schanzen + harter Landung → **kleinste Bodenfreiheit `+0,81 m`, `0` Boden-Durchdringungen**; alle 14 Strecken × 11 Pods × 45 s → **`0` Todesfälle/Abstürze, `0` NaN**; 256 WGSL-/GLSL-Builds mit **0 Warnungen**.

### Nächster sinnvoller Schritt
`TODO.md` §1: Livery-Vorlagen & Startnummern im Hangar + Triebwerks-Hitzeflimmern (≈ 60–90 Min.).
