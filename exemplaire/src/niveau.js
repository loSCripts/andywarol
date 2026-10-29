/* Le niveau : l'intérieur de la boîte, identique pour tout le monde (graine fixe).
   Trois zones :
   - LA CHAÎNE (0–40 m) : facile, tapis roulants ;
   - L'ATELIER (40–~88 m) : plateformes mobiles, fragiles, bouches de vapeur ;
   - LE VIDE (~88–148 m) : les écarts dépassent ce qu'un saut peut faire.
     On n'y passe que sur les corps des autres. Les fondateurs ont posé les
     premières marches ; la suite dépend des joueurs. */
import {
  C, G, V_MAX, BOOST_BOUCHE, J_DEMI, S_HAUT, Y_GLOIRE, MOTS,
} from './constantes.js';
import { alea } from './alea.js';
import { enroule, ecart } from './physique.js';

export const GRAINE = 1115;
/* Numéro du niveau, envoyé au serveur avec chaque corps : un corps posé dans
   une version du niveau n'a pas de sens dans une autre (il flotterait). */
export const VERSION_NIVEAU = 2;

const PARAMS = [
  { l: [3.2, 6.0], gap: [1.2, 3.4], dy: [0.9, 2.3] },
  { l: [2.2, 3.8], gap: [1.8, 4.2], dy: [1.5, 3.0] },
];

export const ZONES = [
  { nom: 'LA CHAÎNE', y0: -10 },
  { nom: "L'ATELIER", y0: 40 },
  { nom: 'LE VIDE', y0: 88 },
];

export function zoneDe(y, niveau) {
  if (niveau && y >= niveau.yVide) return 2;
  return y >= 40 ? 1 : 0;
}

/* Un saut peut-il couvrir dx mètres à l'horizontale en montant de dy ?
   On exige une marge : passer le bord en montant avant dx, retomber après dx. */
export function atteignable(dx, dy, bonus = 0) {
  for (let a = 0.12; a < 1.52; a += 0.02) {
    const vs = V_MAX * Math.cos(a), vy = V_MAX * Math.sin(a) + bonus;
    const disc = vy * vy - 2 * G * dy;
    if (disc < 0) continue;
    const r = Math.sqrt(disc);
    const xMonte = (vs * (vy - r)) / G, xDescend = (vs * (vy + r)) / G;
    if (xMonte <= dx - 0.25 && xDescend >= dx + 0.6) return true;
  }
  return false;
}

/* Positions de corps formant un escalier entre deux corniches trop espacées :
   chaque corps est placé dans l'écart, sa tête formant la marche suivante.
   Sert aux fondateurs et aux tests (simuler ce que feraient les joueurs). */
export function escalierEntre(a, b) {
  const versPlus = ecart(b.s, a.s) > 0;
  const depart = versPlus ? a.s + a.l : a.s;
  const arrivee = versPlus ? b.s : b.s + b.l;
  const g = Math.abs(ecart(arrivee, depart));
  const dy = b.y - a.y;
  const k = Math.max(1, Math.ceil(dy / 2.75) - 1);
  const marches = [];
  for (let i = 1; i <= k; i++) {
    const haut = a.y + (dy * i) / (k + 1);
    const s = enroule(depart + ((versPlus ? 1 : -1) * g * i) / (k + 1));
    marches.push({ s, y: haut - S_HAUT, face: versPlus ? 1 : -1 });
  }
  return marches;
}

function chevaucheArc(s1, l1, s2, l2, marge) {
  return Math.abs(ecart(s1 + l1 / 2, s2 + l2 / 2)) < (l1 + l2) / 2 + marge;
}

export function genererNiveau(graine = GRAINE) {
  const r = alea(graine);
  const corniches = [];
  const fondateurs = [];
  const deco = [];
  const textes = [];

  const ajouter = (c) => {
    c.id = corniches.length;
    c.s = enroule(c.s);
    c.ep ??= 0.5;
    corniches.push(c);
    return c;
  };

  /* Pas de corniche au-dessus d'une autre à moins de 4,4 m : il faut la place
     de sauter sans se cogner la tête. */
  const libre = (s, l, y, amp = 0, ecartMin = 4.4) => corniches.every((c) => {
    if (c.type === 'sol') return y > 3.2;
    if (Math.abs(c.y - y) >= ecartMin) return true;
    const ca = c.amp || 0;
    return !chevaucheArc(c.s - ca, c.l + 2 * ca, s - amp, l + 2 * amp, 1.4);
  });

  // Le fond de la boîte
  ajouter({ s: 0, l: C, y: 0, ep: 3, type: 'sol' });

  // Le chemin principal, en spirale
  const chemin = [];
  let cur = { s: 1.5, l: 0, y: 0, type: 'sol' };
  let dir = 1;
  let compteBouches = 0;
  while (cur.y < 86) {
    const zone = cur.y < 40 ? 0 : 1;
    const p = PARAMS[zone];
    let place = null;
    for (let essai = 0; essai < 40 && !place; essai++) {
      if (essai === 14 || essai === 28) dir = -dir;
      let type = 'fixe';
      const tir = r.suivant();
      // La Chaîne : on apprend tout tôt, un élément à la fois
      if (zone === 0) {
        if (tir < 0.18) type = 'tapis';
        else if (tir < 0.27 && cur.y > 8) type = 'mobile';
        else if (tir < 0.36 && cur.y > 16) type = 'fragile';
        // une bouche de vapeur, toujours, vers 20 m : on la découvre avant l'Atelier
        if (cur.y > 20 && compteBouches < 1 && cur.type !== 'mobile') type = 'bouche';
      }
      if (zone === 1) {
        if (tir < 0.17) type = 'mobile';
        else if (tir < 0.31) type = 'fragile';
        else if (tir < 0.38 && compteBouches < 4) type = 'bouche';
        else if (tir < 0.46) type = 'tapis';
      }
      const amp = type === 'mobile' ? r.entre(1.2, 2.4) : 0;
      const l = r.entre(p.l[0], p.l[1]);
      const ecartS = r.entre(p.gap[0], p.gap[1]);
      // Une bouche de vapeur permet de viser plus haut au tour suivant
      const bonusPrec = cur.type === 'bouche' ? BOOST_BOUCHE : 0;
      const dyMax = cur.type === 'bouche' ? 5.2 : p.dy[1];
      const dy = r.entre(p.dy[0], dyMax);
      // Depuis une plateforme mobile, l'écart est compté depuis sa position la plus éloignée
      const ecartReel = ecartS + (cur.amp || 0) + amp;
      if (!atteignable(ecartReel - J_DEMI, dy, bonusPrec)) continue;
      const s = dir > 0 ? cur.s + cur.l + ecartS + amp + (cur.amp || 0) : cur.s - ecartS - l - amp - (cur.amp || 0);
      const y = cur.y + dy;
      if (!libre(s, l, y, amp)) continue;
      place = ajouter({
        s, l, y, type, zone, chemin: true,
        ...(type === 'tapis' && { tapis: (r.chance(0.5) ? 1 : -1) * r.entre(1.1, 1.7) }),
        ...(type === 'mobile' && { amp, periode: r.entre(3.2, 5.2), phase: r.entre(0, 6.28) }),
        ...(type === 'bouche' && { phase: r.entre(0, 3.2) }),
        ...(type === 'fragile' && {}),
      });
      if (type === 'bouche') compteBouches++;
    }
    if (!place) {
      // Impasse : on repart dans l'autre sens avec une marche simple et sûre
      dir = -dir;
      place = ajouter({ s: cur.s + (dir > 0 ? cur.l + 1.5 : -4), l: 2.5, y: cur.y + 1.2, type: 'fixe', zone, chemin: true });
    }
    chemin.push(place);
    cur = place;
    if (r.chance(0.08)) dir = -dir;
  }

  // Corniches de repos hors du chemin, avec des boîtes empilées et parfois un fondateur
  for (const c of chemin.slice()) {
    if (!r.chance(0.4) || c.type === 'mobile') continue;
    const l = r.entre(2.4, 4.2);
    const cote = r.chance(0.5) ? 1 : -1;
    const s = cote > 0 ? c.s + c.l + r.entre(1.6, 3.2) : c.s - l - r.entre(1.6, 3.2);
    const y = c.y + r.entre(-1.2, 1.6);
    if (y < 2 || !libre(s, l, y)) continue;
    if (!atteignable(1.6 - J_DEMI, Math.max(0, y - c.y))) continue;
    const repos = ajouter({ s, l, y, type: 'fixe', zone: zoneDe(y), repos: true });
    const n = r.entier(1, 4);
    for (let i = 0; i < n; i++) deco.push({ s: enroule(repos.s + 0.4 + r.entre(0, repos.l - 0.8)), y: repos.y, pile: r.entier(1, 3) });
    if (r.chance(0.35)) {
      fondateurs.push({ s: enroule(repos.s + repos.l / 2), y: repos.y, pose: r.choix([0, 5, 1]), face: cote });
    }
  }

  // LE VIDE : neuf marches trop espacées, la dernière est le bord de la boîte
  const p0 = cur;
  const yVide = Math.ceil(p0.y) + 1;
  const vide = [];
  const nVide = 9;
  const yBord = Y_GLOIRE + 0.5;
  const pasVide = (yBord - p0.y) / nVide;
  let prec = p0;
  for (let i = 1; i <= nVide; i++) {
    const dernier = i === nVide;
    const type = dernier ? 'bord' : (i === 3 || i === 7) ? 'bouche' : 'fixe';
    const l = dernier ? 7 : r.entre(2.2, 3.4);
    const y = dernier ? yBord : prec.y + pasVide + r.entre(-0.4, 0.4);
    let s = dir > 0 ? prec.s + prec.l + r.entre(5.0, 6.4) : prec.s - r.entre(5.0, 6.4) - l;
    if (!libre(s, l, y, 0, 5.0)) {
      dir = -dir;
      s = dir > 0 ? prec.s + prec.l + 5.6 : prec.s - 5.6 - l;
    }
    prec = ajouter({ s, l, y, type, zone: 2, chemin: true, vide: true, ...(type === 'bouche' && { phase: r.entre(0, 3.2) }) });
    vide.push(prec);
  }

  /* Les fondateurs : un escalier de corps entre les trois premières marches du vide.
     Chaque corps est placé dans l'écart, sa tête formant la marche suivante. */
  const escalier = (a, b) => {
    for (const m of escalierEntre(a, b)) {
      fondateurs.push({ ...m, pose: r.choix([2, 3, 4, 5]), marche: true });
    }
  };
  escalier(p0, vide[0]);
  escalier(vide[0], vide[1]);
  escalier(vide[1], vide[2]);

  // Numéros, pseudonymes et derniers mots des fondateurs
  fondateurs.forEach((f, i) => {
    f.numero = i + 1;
    f.pseudo = 'FONDATEUR';
    f.mot = r.choix(MOTS);
    f.heure = r.entier(0, 23);
    f.minute = r.entier(0, 59);
    f.batterie = r.entier(1, 100);
    f.fondateur = true;
    f.id = `f${i + 1}`;
  });

  // Point de départ : la corniche fixe la plus basse (la presse est à sa droite)
  const depart = corniches.filter((c) => c.type === 'fixe').reduce((a, b) => (b.y < a.y ? b : a));

  /* Obstacles. Les presses s'abattent sur des corniches du chemin (assez
     longues pour s'arrêter à côté) ; les chaînes font le tour de la boîte à
     trois hauteurs avec des exemplaires suspendus ; les balanciers passent
     au-dessus d'écarts entre deux corniches. */
  const presses = [], chaines = [], balanciers = [];
  const dessusLibre = (c, hauteur) => corniches.every((o) => o === c || o.type === 'sol' || o.y <= c.y
    || o.y - o.ep > c.y + hauteur || !chevaucheArc(o.s - (o.amp || 0), o.l + 2 * (o.amp || 0), c.s, c.l, 0.6));
  for (const c of chemin) {
    if (c.type !== 'fixe' || c.l < (c.zone === 0 ? 3.4 : 3.0) || c.y < 6 || c.vide) continue;
    if (!r.chance(c.zone === 0 ? 0.45 : 0.35) || !dessusLibre(c, 7)) continue;
    presses.push({
      s: enroule(c.s + c.l * r.entre(0.42, 0.58)), l: 1.4, yBas: c.y, yHaut: c.y + 4.4,
      periode: r.entre(3.0, 4.2), phase: r.entre(0, 4.2), corniche: c.id,
    });
  }
  for (const [y, nombre, vitesse] of [[17, 8, 1.2], [33, 7, -1.4], [62, 9, 2.0]]) {
    chaines.push({ y, nombre, espacement: C / nombre, vitesse, s0: r.entre(0, C) });
  }
  const ecarts = [];
  for (let i = 0; i + 1 < chemin.length; i++) {
    const a = chemin[i], b = chemin[i + 1];
    if (a.type === 'mobile' || b.type === 'mobile' || b.y < 24) continue;
    const versPlus = ecart(b.s, a.s) > 0;
    const debut = versPlus ? a.s + a.l : a.s, fin = versPlus ? b.s : b.s + b.l;
    const g = Math.abs(ecart(fin, debut));
    if (g >= 2.2) ecarts.push({ a, b, milieu: enroule(debut + (versPlus ? 1 : -1) * (g / 2)) });
  }
  for (const zone of [0, 1]) {
    const choix = ecarts.filter((e) => e.b.zone === zone);
    for (let k = 0; k < (zone === 0 ? 1 : 3) && choix.length; k++) {
      const e = choix.splice(Math.floor(r.suivant() * choix.length), 1)[0];
      balanciers.push({
        s: e.milieu, y: Math.max(e.a.y, e.b.y) + 4.8, longueur: 3.3,
        amp: r.entre(0.7, 0.85), periode: r.entre(2.8, 3.6), phase: r.entre(0, 6.28),
      });
    }
  }

  // Inscriptions sur la paroi
  textes.push({ texte: 'LA CHAÎNE', s: depart.s + depart.l / 2 - 1.4, y: depart.y + 4.2, h: 1.2, fort: true });
  const pres = (y) => chemin.concat(vide).reduce((m, c) => (Math.abs(c.y - y) < Math.abs(m.y - y) ? c : m));
  for (let h = 10; h <= 140; h += 10) {
    const c = pres(h);
    textes.push({ texte: `${h} M`, s: c.s + c.l / 2, y: c.y + 1.9, h: 1.3, fort: true });
  }
  const panneau = (texte, y, h = 1.0, dec = 0) => {
    const c = pres(y);
    textes.push({ texte, s: c.s + c.l / 2 + dec, y: c.y + 2.6 + h * 0.5, h, fort: true });
  };
  panneau('MOURIR UTILEMENT EST UN DEVOIR', 22, 0.8);
  panneau("L'ATELIER", 41, 1.6);
  panneau('ÉDITION ILLIMITÉE', 63, 0.9);
  panneau('LE VIDE', p0.y + 0.1, 1.6);
  textes.push({ texte: "AU-DELÀ, IL N'Y A QUE VOUS", s: p0.s + p0.l / 2, y: p0.y + 6.2, h: 1.0, fort: true });
  panneau('TON CORPS EST UNE MARCHE', 97, 1.0);
  panneau('INGRÉDIENTS : TOMATES, SEL, EXEMPLAIRES (98 %)', 113, 0.75);
  panneau('SORTIE', 147, 1.8);
  // L'étiquette de la boîte, vue de l'intérieur : à l'envers, en filigrane
  textes.push({ texte: 'SOUPE  CONCENTRÉE', s: 0, y: 72, h: 9, fort: false, miroir: true, tour: true });

  if (presses.length) {
    const p = presses[0], c = corniches[p.corniche];
    textes.push({ texte: 'NE PAS STATIONNER SOUS LA PRESSE', s: c.s + c.l / 2, y: c.y + 7.2, h: 0.7, fort: true });
  }
  panneau('LA CHAÎNE NE S\'ARRÊTE JAMAIS', 14, 0.8);

  return {
    corniches, chemin, vide, fondateurs, deco, textes, yVide, p0, depart,
    obstacles: { presses, chaines, balanciers }, version: VERSION_NIVEAU,
  };
}
