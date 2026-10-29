/* Physique 2D enroulée (s, y). Pure : aucune dépendance au rendu, pour pouvoir
   la faire tourner dans Node (tests d'accessibilité du niveau) et pour l'aperçu
   de trajectoire, qui rejoue exactement les mêmes pas que le vrai saut. */
import {
  C, G, V_MAX, BOOST_BOUCHE, J_DEMI, J_HAUT, S_DEMI, S_HAUT,
} from './constantes.js';

export function enroule(s) {
  s %= C;
  return s < 0 ? s + C : s;
}

/* Écart signé le plus court a − b sur le cercle, dans [−C/2, C/2]. */
export function ecart(a, b) {
  let d = (a - b) % C;
  if (d > C / 2) d -= C;
  else if (d < -C / 2) d += C;
  return d;
}

const TAILLE_SEAU = 4;
const EPS = 1e-4;

/* ------------------------------------------------------------ Obstacles
   Presse : un bloc qui s'abat sur une corniche ; mortel quand il descend ou
   qu'il est en bas. Chaîne et balancier : des exemplaires suspendus qui
   bousculent le joueur (sans le tuer). Tout est fonction du temps du monde,
   donc rejoué à l'identique par l'aperçu de trajectoire et par les tests. */

export const H_PRESSE = 1.3;
export const POUSSEE = { vs: 7.5, vy: 5.5, immunite: 0.6 };

/* Cycle d'une presse de période T : repos en haut, tremblement (0,5 s, pour
   prévenir), chute (0,15 s), en bas (0,4 s), remontée (0,95 s). */
export function etatPresse(p, t) {
  const T = p.periode;
  const u = (((t + p.phase) % T) + T) % T;
  if (u < T - 2.0) return { phase: 'repos', bas: p.yHaut };
  if (u < T - 1.5) return { phase: 'tremble', bas: p.yHaut };
  if (u < T - 1.35) {
    const f = (u - (T - 1.5)) / 0.15;
    return { phase: 'descend', bas: p.yHaut + (p.yBas - p.yHaut) * f * f };
  }
  if (u < T - 0.95) return { phase: 'bas', bas: p.yBas };
  const f = (u - (T - 0.95)) / 0.95;
  return { phase: 'monte', bas: p.yBas + (p.yHaut - p.yBas) * (1 - (1 - f) * (1 - f)) };
}

/* Position d'un corps suspendu à une chaîne qui fait le tour de la boîte. */
export function corpsChaine(c, i, t) {
  return enroule(c.s0 + i * c.espacement + c.vitesse * t);
}

/* Angle et vitesse angulaire d'un balancier. */
export function angleBalancier(b, t) {
  const w = (2 * Math.PI) / b.periode;
  return { th: b.amp * Math.sin(w * t + b.phase), dth: b.amp * w * Math.cos(w * t + b.phase) };
}

/* Une boîte : { s (bord gauche), l, y0, y1, type, actif }.
   Les boîtes mobiles bougent en s ; elles sont gardées à part et toujours testées. */
export class Monde {
  constructor() {
    this.seaux = new Map();
    this.mobiles = [];
    this.fragiles = [];
    this.bouches = [];
    this.presses = [];
    this.chaines = [];
    this.balanciers = [];
    this.heurts = [];   // boîtes des corps suspendus, recalculées à chaque pas
    this.t = 0;
  }

  ajouterPresse(p) {
    const b = { s: enroule(p.s - p.l / 2), l: p.l, y0: p.yHaut, y1: p.yHaut + H_PRESSE, type: 'presse', presse: p, actif: true, phase: 'repos' };
    this.presses.push(b);
    return b;
  }

  ajouterChaine(c) {
    this.chaines.push(c);
    for (let i = 0; i < c.nombre; i++) this.heurts.push({ s: 0, l: 0.7, y0: c.y - 2.1, y1: c.y - 0.5, vs: c.vitesse, chaine: c, i });
  }

  ajouterBalancier(bl) {
    this.balanciers.push(bl);
    this.heurts.push({ s: 0, l: 0.7, y0: 0, y1: 0, vs: 0, balancier: bl });
  }

  /* Place presses et corps suspendus à l'instant t du monde. */
  majObstacles() {
    const t = this.t;
    for (const b of this.presses) {
      const e = etatPresse(b.presse, t);
      b.phase = e.phase;
      b.y0 = e.bas;
      b.y1 = e.bas + H_PRESSE;
    }
    for (const h of this.heurts) {
      if (h.chaine) {
        h.s = enroule(corpsChaine(h.chaine, h.i, t) - h.l / 2);
      } else {
        const bl = h.balancier;
        const { th, dth } = angleBalancier(bl, t);
        const yBout = bl.y - bl.longueur * Math.cos(th);
        h.s = enroule(bl.s + bl.longueur * Math.sin(th) - h.l / 2);
        h.y0 = yBout - 1.6;
        h.y1 = yBout;
        h.vs = bl.longueur * Math.cos(th) * dth;
      }
    }
  }

  ajouter(b) {
    b.actif = true;
    if (b.mobile) {
      b.s0 = b.s;
      b.ds = 0;
      this.mobiles.push(b);
      return b;
    }
    if (b.fragile) this.fragiles.push(b);
    if (b.bouche) this.bouches.push(b);
    const k0 = Math.floor(b.y0 / TAILLE_SEAU), k1 = Math.floor(b.y1 / TAILLE_SEAU);
    for (let k = k0; k <= k1; k++) {
      let seau = this.seaux.get(k);
      if (!seau) this.seaux.set(k, (seau = []));
      seau.push(b);
    }
    return b;
  }

  retirer(b) {
    for (const seau of this.seaux.values()) {
      const i = seau.indexOf(b);
      if (i >= 0) seau.splice(i, 1);
    }
  }

  ajouterStatue(st) {
    return this.ajouter({
      s: enroule(st.s - S_DEMI), l: 2 * S_DEMI, y0: st.y, y1: st.y + S_HAUT,
      type: 'statue', statue: st,
    });
  }

  /* Appelle f(b) pour chaque boîte pouvant toucher la tranche [y0, y1]. */
  pres(y0, y1, f) {
    const k0 = Math.floor(y0 / TAILLE_SEAU), k1 = Math.floor(y1 / TAILLE_SEAU);
    const vues = k1 > k0 ? new Set() : null;
    for (let k = k0; k <= k1; k++) {
      const seau = this.seaux.get(k);
      if (!seau) continue;
      for (const b of seau) {
        if (vues) { if (vues.has(b)) continue; vues.add(b); }
        if (b.actif) f(b);
      }
    }
    for (const b of this.mobiles) if (b.actif) f(b);
    for (const b of this.presses) if (b.y1 >= y0 && b.y0 <= y1) f(b);
  }

  /* Fait avancer le temps du monde : plateformes mobiles, fragiles, bouches. */
  avancer(dt) {
    this.t += dt;
    const t = this.t;
    for (const b of this.mobiles) {
      const s = enroule(b.s0 + b.amp * Math.sin((2 * Math.PI * t) / b.periode + b.phase));
      b.ds = ecart(s, b.s);
      b.s = s;
    }
    for (const b of this.fragiles) {
      if (b.chute !== undefined && t > b.chute + 4) {
        b.actif = true;
        b.contact = undefined;
        b.chute = undefined;
      } else if (b.contact !== undefined && b.chute === undefined && t > b.contact + 0.6) {
        b.actif = false;
        b.chute = t;
      }
    }
    this.majObstacles();
  }

  boucheActive(b) {
    return (this.t + b.phase) % 3.2 < 1.0;
  }

  /* Instantané/restauration de l'état variable, pour l'aperçu de trajectoire. */
  photo() {
    return {
      t: this.t,
      mob: this.mobiles.map((b) => [b.s, b.ds]),
      fr: this.fragiles.map((b) => [b.actif, b.contact, b.chute]),
    };
  }

  restaurer(p) {
    this.t = p.t;
    this.mobiles.forEach((b, i) => { [b.s, b.ds] = p.mob[i]; });
    this.fragiles.forEach((b, i) => { [b.actif, b.contact, b.chute] = p.fr[i]; });
    this.majObstacles();
  }
}

export function creerJoueur(s, y) {
  return { s: enroule(s), y, vs: 0, vy: 0, sol: null, coyote: 0, face: 1, tSol: 0, immunite: 0, ecrase: false, invincible: false, vol: false };
}

function chevauche(j, b, y) {
  if (y >= b.y1 || y + J_HAUT <= b.y0) return false;
  return Math.abs(ecart(b.s + b.l / 2, j.s)) < b.l / 2 + J_DEMI;
}

function porte(j, b) {
  return b.actif && Math.abs(j.y - b.y1) < 0.02
    && Math.abs(ecart(b.s + b.l / 2, j.s)) < b.l / 2 + J_DEMI;
}

/* Un pas de physique. `evts` (facultatif) reçoit les événements sonores.
   `sim` : aperçu, ne déclenche pas les plateformes fragiles. */
export function pas(j, monde, dt, evts, sim) {
  if (j.ecrase) return;
  // Mode développeur : vol libre, sans pesanteur ni collisions
  if (j.vol) return;
  // Écrasement : une presse qui descend (ou est en bas) sur le joueur
  for (const b of monde.presses) {
    if ((b.phase === 'descend' || b.phase === 'bas') && chevauche(j, b, j.y) && !j.invincible) {
      j.ecrase = true;
      evts?.push('ecrase');
      return;
    }
  }

  // Transport par le support
  if (j.sol) {
    const b = j.sol;
    if (b.tapis) j.s = enroule(j.s + b.tapis * dt);
    if (b.presse) j.y = b.y1;   // debout sur une presse (en tombant d'au-dessus) : on suit son mouvement
    if (b.mobile) j.s = enroule(j.s + b.ds);
    if (b.fragile && !sim && b.contact === undefined) b.contact = monde.t;
    if (b.bouche && monde.boucheActive(b) && j.tSol > 0.25) {
      // Bouffée de vapeur sur un joueur immobile : il est soulevé puis retombe
      j.vy = 12;
      j.vs = 0;
      j.sol = null;
      evts?.push('bouche');
    }
  }

  if (!j.sol) {
    j.vy = Math.max(j.vy - G * dt, -32);
    j.s = enroule(j.s + j.vs * dt);
  } else {
    j.tSol += dt;
  }
  if (j.coyote > 0) j.coyote -= dt;

  // Résolution horizontale
  monde.pres(j.y - 1, j.y + J_HAUT + 1, (b) => {
    if (!chevauche(j, b, j.y)) return;
    if (j.sol && Math.abs(j.y - b.y1) < 0.02) return;
    const d = ecart(b.s + b.l / 2, j.s);
    const marge = b.l / 2 + J_DEMI + EPS;
    j.s = enroule(d > 0 ? b.s + b.l / 2 - marge : b.s + b.l / 2 + marge);
    if (!j.sol) {
      j.vs = -j.vs * 0.3;
      evts?.push('mur');
    }
  });

  // Résolution verticale
  if (!j.sol) {
    const y = j.y + j.vy * dt;
    let atterri = null, cogne = null;
    monde.pres(Math.min(y, j.y) - 1, Math.max(y, j.y) + J_HAUT + 1, (b) => {
      if (!chevauche(j, b, y)) return;
      if (j.vy <= 0 && j.y >= b.y1 - 0.05) {
        if (!atterri || b.y1 > atterri.y1) atterri = b;
      } else if (j.vy > 0) {
        if (!cogne || b.y0 < cogne.y0) cogne = b;
      }
    });
    if (atterri) {
      j.y = atterri.y1;
      evts?.push(j.vy < -14 ? 'lourd' : 'atterrissage');
      j.vy = 0;
      j.vs = 0;
      j.sol = atterri;
      j.tSol = 0;
    } else if (cogne) {
      j.y = cogne.y0 - J_HAUT - EPS;
      j.vy = Math.min(0, -j.vy * 0.1);
      evts?.push('cogne');
    } else {
      j.y = y;
    }
  } else if (!porte(j, j.sol)) {
    // Le support a disparu ou s'est dérobé : chercher un autre support au même niveau
    let autre = null;
    monde.pres(j.y - 1, j.y + 1, (b) => { if (!autre && porte(j, b)) autre = b; });
    if (autre) j.sol = autre;
    else {
      j.sol = null;
      j.coyote = 0.09;
      j.vy = 0;
      j.vs = 0;
    }
  }
  bousculer(j, monde, dt, evts);
}

/* Les corps suspendus bousculent : le joueur est projeté dans leur sens de
   déplacement, puis protégé un instant pour ne pas être frappé en boucle. */
function bousculer(j, monde, dt, evts) {
  if (j.immunite > 0) { j.immunite -= dt; return; }
  for (const h of monde.heurts) {
    if (h.y1 < j.y - 0.5 || h.y0 > j.y + J_HAUT + 0.5) continue;
    if (!chevauche(j, h, j.y)) continue;
    const d = ecart(j.s, h.s + h.l / 2);
    const sens = Math.abs(h.vs) > 0.3 ? Math.sign(h.vs) : (d >= 0 ? 1 : -1);
    j.vs = sens * POUSSEE.vs;
    j.vy = Math.max(j.vy, POUSSEE.vy);
    j.sol = null;
    j.coyote = 0;
    j.immunite = POUSSEE.immunite;
    evts?.push('heurt');
    return;
  }
}

/* Lance un saut. Renvoie false si le joueur n'a pas d'appui. */
export function sauter(j, monde, vs, vy) {
  if (!j.sol && j.coyote <= 0) return false;
  const n = Math.hypot(vs, vy);
  if (n > V_MAX) { vs *= V_MAX / n; vy *= V_MAX / n; }
  if (j.sol?.bouche && monde.boucheActive(j.sol)) vy += BOOST_BOUCHE;
  j.vs = vs;
  j.vy = vy;
  j.sol = null;
  j.coyote = 0;
  if (Math.abs(vs) > 0.3) j.face = vs > 0 ? 1 : -1;
  return true;
}

/* Rejoue un saut sans toucher au monde réel : points de la trajectoire et point d'arrivée. */
export function apercu(j, monde, vs, vy, dureeMax = 1.6, dt = 1 / 60) {
  const photo = monde.photo();
  const k = { ...j };
  const pts = [];
  if (!sauter(k, monde, vs, vy)) { monde.restaurer(photo); return { pts, arrivee: null }; }
  let arrivee = null;
  for (let t = 0; t < dureeMax; t += dt) {
    monde.avancer(dt);
    pas(k, monde, dt, null, true);
    pts.push(k.s, k.y);
    if (k.ecrase) break;
    if (k.sol) { arrivee = { s: k.s, y: k.y, b: k.sol }; break; }
  }
  monde.restaurer(photo);
  return { pts, arrivee };
}

/* Hauteur de la surface la plus haute sous le joueur (à ±1,5 m) : sert à dire
   si un corps imprimé maintenant ferait une marche atteignable. */
export function surfaceDessous(j, monde) {
  let best = -Infinity;
  monde.pres(j.y - 8, j.y + 0.1, (b) => {
    if (b.y1 > j.y + 0.01) return;
    if (Math.abs(ecart(b.s + b.l / 2, j.s)) < b.l / 2 + 1.5 && b.y1 > best) best = b.y1;
  });
  return best;
}

export { S_HAUT, J_HAUT };
