# HANDOFF

## Stand: 2026-11-16 (Session 5) – Landschafts-TODOs + mehr Landschaftsdetails

### Erledigt in Session 5
1. **Gelände-Texturen** – neues `terrainMaterial.ts`:
   - Splatting Sand / Kies / Becken / Fels mit Höhenmischung.
   - Gesteinsschichten je Welt (`STRATA`, auch auf Schluchtwänden und Landmarken).
   - Ziehende Wolkenschatten.
   - Basis: neues Vertex-Attribut `aSplat` aus `terrain.ts`; Becken = abgeflachte Senken (Salzpfannen, gefrorene Seen, Sümpfe, Lavakrusten mit glühenden Rissen).
2. **Bodenbewuchs** – `groundCover.ts`:
   - 26 Typen über 8 Welten, rund 27.000 Instanzen im Dschungel.
   - 150-m-Zellen mit Sichtweite je Typ, Dither-Fade, Wind.
3. **Rauchsäulen ohne Partikel** – `smoke.ts`: Billboards (1 Draw-Call) an Schloten, Vulkanen, Wracks, Stationen, Bohrinseln und Schloten der Welten, dazu wandernde Staub-, Schnee- und Methanteufel.
4. **Leben** – `wildlife.ts`: Vogelschwärme, Bantha-Herden, Langhals-Riesen, Sandkriecher, Landgleiter, Himmelsverkehr, Patrouillenschiffe, Lastkähne; Animation auf der GPU (Beine, Hälse, Flügel).
5. **Neue Landmarken:** Krayt-Skelett, Feuchtfarm, Steinkreis, Leuchtturm, Wrack auf Ando Prime. **Sandverwehungen** auf Tatooine.
6. **Fixes**
   - WebGPU-Texturlimit (17 > 16): Höhe in `map.a`, Rauheit in `normalMap.a` gepackt.
   - Dschungel-Wasserspiegel überflutete das Land → abgesenkt.
   - God-Ray-Streifen durch Wasserglanz → Himmelsmaske.
   - Alte Kegel-„Farne“ entfernt; Matsch-Straße weniger glänzend.
   - KI-Explosionen an Hindernissen/Set-Pieces → Schaden-Cooldowns, KI-Schaden × 0,45, Set-Pieces nicht auf Hindernisfeldern.
7. **Verifiziert**
   - `tsc` sauber, Build ok (≈ 1,98 MB).
   - WebGPU-Renders: Boonta, Dschungel (Langhals-Riese), Malastare (Vulkan-Aschesäule), Ando Prime, Vulkanwelt.
   - Physik-Sims: Henker-Sprint 0 Explosionen (vorher 5), Malastare 2 (vorher 7), Boonta 0, 0 NaN.
   - App bootet unter WebGPU mit 0 Konsolenfehlern.

### Bekannt / offen
- KI in dichten Hindernisfeldern (Malastare-100, 36–44 %) – siehe `TODO.md` §1.
- Bewuchs-Platzierung kostet Ladezeit (3 `heightAt` je Instanz).

### Test setup (nach jedem Sandbox-Reset)
```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright@1.49.1 && npx playwright install chromium
mkdir -p /tmp/libs/debs /tmp/libs/state/lists/partial /tmp/libs/cache/archives/partial && cd /tmp/libs/debs
apt-get -o Dir::State::Lists=/tmp/libs/state/lists -o Dir::Cache=/tmp/libs/cache -o Debug::NoLocking=1 update
apt-get -o Dir::State::Lists=/tmp/libs/state/lists -o Dir::Cache=/tmp/libs/cache download libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 libxkbcommon0 libwayland-server0 libxi6 libxtst6 libxshmfence1 libvulkan1 libxrender1 libxext6 libx11-6 libxcb1 libxau6 libxdmcp6 libbsd0 libmd0
for f in *.deb; do dpkg-deb -x "$f" /tmp/libs/root; done
```

### Frühere Sessions
- S4: offene Landschaften, Halbschluchten, Landmarken, BatchedMesh, Gelände-LOD, Set-Pieces, Wetter.
- S3: Trefferkreis-Kollision, Chunking, Streckendetails, Geysire, 4 neue Strecken.
- S2: WebGPU + TSL. S1: High-Poly-Podracer.

### Wichtig für den nächsten Agenten
- Lokaler Commit ist **nicht gepusht**; die Sandbox verliert `.git` → Wiederherstellung siehe `CLAUDE.md`.
- Neue Materialien: Texturbudget (16/Stage) beachten, gepackte Kanäle nutzen (`CLAUDE.md` → Rendering rules).

### Nächster sinnvoller Schritt
`TODO.md` §1: KI-Pfadsuche durch Hindernisfelder (≈ 1 Stunde; Test: `tools/harness/run.sh game "s9:30"` → `deaths=[]`).
