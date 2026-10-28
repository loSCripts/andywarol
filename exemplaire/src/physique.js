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

/* Une boîte : { s (bord gauche), l, y0, y1, type, actif }.
   Les boîtes mobiles bougent en s ; elles sont gardées à part et toujours testées. */
export class Monde {
  constructor() {
    this.seaux = new Map();
    this.mobiles = [];
    this.fragiles = [];
    this.bouches = [];
    this.t = 0;
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
  }
}

export function creerJoueur(s, y) {
  return { s: enroule(s), y, vs: 0, vy: 0, sol: null, coyote: 0, face: 1, tSol: 0 };
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
  // Transport par le support
  if (j.sol) {
    const b = j.sol;
    if (b.tapis) j.s = enroule(j.s + b.tapis * dt);
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
