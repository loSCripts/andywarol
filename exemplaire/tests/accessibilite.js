/* Exploration du niveau par simulation : depuis chaque surface atteinte, on
   essaie une gerbe de sauts avec la vraie physique et on note où l'on retombe.
   Sert aux tests et au réglage du générateur. */
import { V_MAX } from '../src/constantes.js';
import { creerJoueur, pas, sauter } from '../src/physique.js';

const DT = 1 / 60;

function positionsDepart(b) {
  if (b.type === 'sol') return [1.5, 4, 8, 20, 40];
  return [0.15, 0.5, 0.85].map((f) => b.s + f * b.l);
}

export function explorer(monde, depart, { yMax = 1e9 } = {}) {
  const atteintes = new Set([depart]);
  const file = [depart];
  const parents = new Map();
  while (file.length) {
    const b = file.shift();
    if (b.y1 > yMax) continue;
    const temps = b.mobile || b.bouche ? [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8] : [0];
    for (const t0 of temps) {
      monde.t = t0;
      monde.avancer(0);
      for (const s0 of positionsDepart(b)) {
        for (let a = 0; a <= 18; a++) {
          const th = (Math.PI * (a + 0.5)) / 19.0;
          for (const p of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
            monde.t = t0;
            for (const m of monde.mobiles) { m.ds = 0; }
            monde.avancer(0);
            const j = creerJoueur(s0, b.y1);
            j.sol = b;
            sauter(j, monde, V_MAX * p * Math.cos(th), V_MAX * p * Math.sin(th));
            for (let k = 0; k < 180; k++) {
              monde.avancer(DT);
              pas(j, monde, DT, null, true);
              if (j.sol) break;
            }
            const arr = j.sol;
            if (arr && !atteintes.has(arr)) {
              atteintes.add(arr);
              parents.set(arr, b);
              file.push(arr);
            }
          }
        }
      }
    }
  }
  return { atteintes, parents };
}
