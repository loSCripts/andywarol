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

function obstacleProche(monde, b) {
  if (b.type === 'sol') return false;
  // l'obstacle peut être au départ comme à l'arrivée du saut
  return monde.presses.some((p) => Math.abs(p.presse.yBas - b.y1) < 7)
    || monde.chaines.some((c) => b.y1 > c.y - 8 && b.y1 < c.y + 2)
    || monde.balanciers.some((bl) => Math.abs(bl.y - 4.8 - b.y1) < 9);
}

export function explorer(monde, depart, { yMax = 1e9 } = {}) {
  const atteintes = new Set([depart]);
  const file = [depart];
  const parents = new Map();
  while (file.length) {
    const b = file.shift();
    if (b.y1 > yMax) continue;
    // Là où quelque chose bouge (plateforme, bouche, presse, corps suspendus),
    // on essaie plusieurs instants de départ : il faut un moment où ça passe
    const temps = b.mobile || b.bouche || obstacleProche(monde, b) ? [0, 0.45, 0.9, 1.35, 1.8, 2.25, 2.7, 3.15, 3.6, 4.05] : [0];
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
              if (j.sol || j.ecrase) break;
            }
            const arr = j.ecrase ? null : j.sol;
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
