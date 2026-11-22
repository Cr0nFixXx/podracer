// Schadensmodell per racer: Panzerzonen + Bruchteile (CONTEXT.md, docs/adr/0001). Pure data and numbers – no three import, the node CI uses it.
//   Panzerzone = how hard a hit from one direction lands (factor on the damage; < 1 armoured, > 1 soft).
//   Bruchteil  = a part that breaks off when its engine side's health falls through its step (50 / 35 / 20 %). It has no health of
//                its own, stays gone until the respawn (repair restores health, not parts) and costs a little handling – or it was a
//                guard that kept hits out of a Panzerzone while it was attached.

/** Where a hit comes from (Panzerzone). A racer's Schadensmodell weighs each zone. */
export type DamageZone = 'front' | 'side' | 'top' | 'belly' | 'heat';
/** Handling multipliers from lost Bruchteile (1 = intact). */
export interface PodFx { vmax: number; accel: number; turn: number; grip: number; abDecel: number; cool: number; heatRate: number }
export const FX_NONE: Readonly<PodFx> = { vmax: 1, accel: 1, turn: 1, grip: 1, abDecel: 1, cool: 1, heatRate: 1 };
const FX_KEYS = Object.keys(FX_NONE) as (keyof PodFx)[];

export interface Bruchteil {
  /** names the visible part (podModel hides it): `…L` / `…R` for a pair, plain for a centre part */
  id: string;
  /** HUD name (German) and what happened to it (default "abgerissen") */
  label: string; lost?: string;
  /** whose health breaks it: -1 = left engine side (hpL), +1 = right (hpR), 0 = centre part (whichever side is lower) */
  side: -1 | 0 | 1;
  /** it breaks when that health falls below this many percent */
  step: 50 | 35 | 20;
  /** handling once it is gone: multipliers 0.90–0.95 (heatRate 1.05–1.10) */
  fx?: Partial<PodFx>;
  /** while attached it keeps hits out: factor on the damage from these zones on its side (a centre part guards both sides) */
  guard?: Partial<Record<DamageZone, number>>;
}
export interface DamageModel { armor: Record<DamageZone, number>; parts: Bruchteil[] }

/** A/B switches (node CI: ARMOR=0 PARTS=0 must reproduce the table from before the Schadensmodelle). */
export const DAMAGE_RULES = { armor: true, parts: true };
/** No number may lose more than this share to lost parts (decision "mild"). */
export const FX_CAP = 0.15;

type Fx = Partial<PodFx>; type Guard = Partial<Record<DamageZone, number>>;
type Extra = { guard?: Guard; lost?: string };
const armor = (front: number, side: number, top: number, belly: number, heat: number): Record<DamageZone, number> => ({ front, side, top, belly, heat });
/** the same part on both engine sides */
const pair = (step: Bruchteil['step'], id: string, label: string, fx?: Fx, x: Extra = {}): Bruchteil[] => ([-1, 1] as const).map(side => ({ id: id + (side < 0 ? 'L' : 'R'), label, side, step, ...(fx ? { fx } : {}), ...x }));
/** a single part on one side or in the centre */
const one = (side: Bruchteil['side'], step: Bruchteil['step'], id: string, label: string, fx?: Fx, x: Extra = {}): Bruchteil => ({ id, label, side, step, ...(fx ? { fx } : {}), ...x });
const OUT = 'ausgefallen', DEAD = 'erloschen'; // for what stays on the pod and only stops working (an engine flames out, an arc dies) – a part that breaks off is 'abgerissen'

// One Schadensmodell per racer (pod id). Zones: front · side · top · belly · heat. Each HUD box has exactly one Bruchteil per step.
const MODELS: Record<string, DamageModel> = {
  // ---- light twin-engine racers: thin skin on the flanks, wings and fins go first
  aurora: { armor: armor(1.0, 1.15, 1.0, 0.9, 0.95), parts: [ // wing plates tear off (grip), the tail gyro fails (turn)
    ...pair(50, 'wing', 'Flügelplatte', { grip: 0.93 }), one(0, 35, 'gyro', 'Kreisel-Stabilisator', { turn: 0.92 }), ...pair(20, 'inner', 'Innenflügel', { grip: 0.94 })] },
  mavik: { armor: armor(1.2, 1.0, 1.0, 0.9, 0.9), parts: [ // Hollo Needle: the nose probe bends (turn), canards and fin snap
    one(0, 50, 'probe', 'Nasensonde', { turn: 0.94 }), ...pair(35, 'canard', 'Canards', { grip: 0.94 }), one(0, 20, 'fin', 'Heckfinne', { turn: 0.92 })] },
  rattis: { armor: armor(0.95, 1.2, 1.0, 0.95, 0.9), parts: [ // Tyr Vespa: a blade wing shears off (grip)
    ...pair(50, 'blade', 'Klingenflügel', { grip: 0.92 }), ...pair(35, 'feeler', 'Fühler', { turn: 0.95 }), one(0, 20, 'stinger', 'Stachel', { grip: 0.95 })] },
  elana: { armor: armor(1.0, 1.1, 1.1, 0.9, 0.9), parts: [ // Mak Starling: wings, an air-brake feather (braking), the dorsal fin (turn)
    ...pair(50, 'wing', 'Schwinge', { grip: 0.94 }), ...pair(35, 'petal', 'Bremsfeder', { abDecel: 0.9 }), one(0, 20, 'fin', 'Rückenfinne', { turn: 0.92 })] },
  halo: { armor: armor(0.9, 1.2, 1.0, 1.0, 0.9), parts: [ // Lyss Halo-9: the ring wings crack, then a segment goes (turn, grip)
    ...pair(50, 'ringA', 'Ringflügel-Segment', { turn: 0.94 }), one(0, 35, 'arch', 'Kuppelbogen', { turn: 0.95 }), ...pair(20, 'ringB', 'Ringflügel-Segment', { grip: 0.93 })] },

  // ---- heavy twin-engine racers
  brute: { armor: armor(0.75, 0.95, 1.15, 1.0, 1.15), parts: [ // Vrak Splitter-X: hard nose; top slats rip (cooling), intake petals jam (accel)
    ...pair(50, 'slats', 'Kühllamellen', { cool: 0.92 }), ...pair(35, 'petals', 'Ansaugklappen', { accel: 0.93 }),
    one(-1, 20, 'fin', 'Haifinne', { turn: 0.93 }), one(1, 20, 'stub', 'Stummelfinne', { turn: 0.95 })] },
  aldo: { armor: armor(1.0, 1.1, 1.05, 1.05, 0.8), parts: [ // Beerak Fireflare: built for heat; radiators leak (cooling, more heat)
    ...pair(50, 'rad', 'Radiator', { cool: 0.92, heatRate: 1.06 }), ...pair(35, 'loop', 'Kühlschleife', { cool: 0.93, heatRate: 1.05 }, { lost: 'geplatzt' }), ...pair(20, 'vane', 'Radiatorflügel', { grip: 0.95 })] },
  odo: { armor: armor(1.15, 1.05, 1.2, 1.0, 1.2), parts: [ // Mandrel Ram: ram rings and ram bar eat front hits until they drop
    ...pair(50, 'hoop', 'Rammring', undefined, { guard: { front: 0.85 } }), one(0, 35, 'ram', 'Rammbug', undefined, { guard: { front: 0.55 } }), ...pair(20, 'skid', 'Kufenplatte', undefined, { guard: { belly: 0.8 } })] },
  manta: { armor: armor(0.9, 1.1, 0.9, 1.2, 0.9), parts: [ // Dorn Manta: flat and low – soft belly; wing tips (grip), fins (turn)
    ...pair(50, 'winglet', 'Flügelspitze', { grip: 0.93 }), ...pair(35, 'fin', 'Seitenleitwerk', { turn: 0.94 }), ...pair(20, 'delta', 'Deltafläche', { grip: 0.94 })] },
  cyclone: { armor: armor(1.2, 0.9, 0.95, 0.95, 1.0), parts: [ // Tarn Cyclone: open rotors up front; a rotor blade goes (speed), the ring fin (turn)
    ...pair(50, 'blade', 'Rotorblatt', { vmax: 0.95, accel: 0.95 }), ...pair(35, 'fin', 'Ringfinne', { turn: 0.94 }), one(0, 20, 'tail', 'Leitwerksträger', { grip: 0.92 })] },

  // ---- multi-engine racers and the special one
  gasvaro: { armor: armor(1.1, 1.1, 1.05, 1.05, 1.1), parts: [ // Tenroc 6-Fach: thin skin; single engines flame out one by one (speed, accel)
    ...pair(50, 'engC', 'Oberes Triebwerk', { vmax: 0.95, accel: 0.95 }, { lost: OUT }), ...pair(35, 'engB', 'Äußeres Triebwerk', { vmax: 0.95, accel: 0.95 }, { lost: OUT }), ...pair(20, 'manifold', 'Verteilerrohr', { accel: 0.95 }, { lost: 'geplatzt' })] },
  bomquad: { armor: armor(1.1, 1.0, 0.9, 1.0, 1.0), parts: [ // Quadra Lumber: a ring shroud cracks (turn), one arc of the X dies (accel)
    ...pair(50, 'shroud', 'Ringschürze', { turn: 0.94 }), ...pair(35, 'arc', 'Energieblitz', { accel: 0.93 }, { lost: DEAD }), ...pair(20, 'arm', 'Ausleger', { grip: 0.95 })] },
  teemo: { armor: armor(1.0, 1.25, 1.0, 1.0, 1.1), parts: [ // Pagali Ironclad: skirts and plates take the first hits, then fall; an upper engine goes late
    ...pair(50, 'skirt', 'Panzerschürze', undefined, { guard: { side: 0.7 } }), ...pair(35, 'plate', 'Panzerplatte', undefined, { guard: { side: 0.85, front: 0.9 } }), ...pair(20, 'engU', 'Oberes Triebwerk', { vmax: 0.95, accel: 0.93 }, { lost: OUT })] },
  volt: { armor: armor(1.15, 1.2, 1.05, 1.05, 0.55), parts: [ // Quill Voltspire: weak hull that shrugs off heat; its arcs die 3 → 2 → 1 (accel)
    one(0, 50, 'arcA', 'Energiebogen', { accel: 0.95 }, { lost: DEAD }), one(0, 35, 'arcB', 'Energiebogen', { accel: 0.95 }, { lost: DEAD }), one(0, 20, 'mast', 'Entladungsmast', { cool: 0.9 })] },
};

/** Schadensmodell of a racer. Every pod id needs its own entry – an unknown id is a bug. */
export function damageModel(podId: string): DamageModel {
  const m = MODELS[podId];
  if (!m) throw new Error(`No Schadensmodell for pod "${podId}" – add it to MODELS in src/game/podDamage.ts`);
  return m;
}

/** Handling multipliers for a set of lost Bruchteile (bit i = parts[i] is gone). Effects multiply; no number loses more than
 *  FX_CAP in total; a Gegner feels half of it. */
export function partsFx(m: DamageModel, mask: number, ai: boolean): PodFx {
  const f: PodFx = { ...FX_NONE };
  m.parts.forEach((b, i) => { if (b.fx && (mask >> i) & 1) for (const k of FX_KEYS) f[k] *= b.fx[k] ?? 1; });
  for (const k of FX_KEYS) {
    let d = k === 'heatRate' ? Math.min(FX_CAP, f[k] - 1) : -Math.min(FX_CAP, 1 - f[k]); // signed share: heat builds up faster, everything else gets weaker
    if (ai) d *= 0.5;
    f[k] = 1 + d;
  }
  return f;
}

/** Factor on the damage of a hit from `zone` on engine side `side`: the racer's armour there times the guards still attached. */
export function zoneFactor(m: DamageModel, mask: number, side: -1 | 1, zone: DamageZone): number {
  let f = m.armor[zone];
  m.parts.forEach((b, i) => { const g = b.guard?.[zone]; if (g !== undefined && !((mask >> i) & 1) && (b.side === side || b.side === 0)) f *= g; });
  return f;
}

/** Bruchteile that are due: bit mask of the parts whose side's health is below their step. */
export function partsDue(m: DamageModel, hpL: number, hpR: number): number {
  let mask = 0;
  m.parts.forEach((b, i) => { if ((b.side < 0 ? hpL : b.side > 0 ? hpR : Math.min(hpL, hpR)) < b.step) mask |= 1 << i; });
  return mask;
}

/** HUD lamps of one damage box, rows 50 / 35 / 20 %: 0 = no part on that row, 1 = attached, 2 = lost. */
export function partLamps(m: DamageModel, mask: number, side: -1 | 1): number[] {
  return [50, 35, 20].map(step => { const i = m.parts.findIndex(b => b.step === step && (b.side === side || b.side === 0)); return i < 0 ? 0 : (mask >> i) & 1 ? 2 : 1; });
}

/** HUD message for a lost Bruchteil. */
export const lostMessage = (b: Bruchteil) => `${b.label} ${b.lost ?? 'abgerissen'}!`.toUpperCase();
