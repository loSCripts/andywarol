/* Tous les modèles 3D du jeu, fabriqués ici par le code : aucun fichier à
   télécharger, aucune licence à vérifier, quelques kilo-octets.
   Chaque sommet porte une « encre » (attribut aEncre) : le rendu ne connaît pas
   les couleurs, seulement des numéros d'encre que la sérigraphie colore ensuite
   (voir rendu.js). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, R_MUR, R_INT, HAUT_BOITE, C } from './constantes.js';

export const ENCRE = { FOND: 0, MUR: 1, CORNICHE: 2, JOUEUR: 3, STATUE: 4, ACCENT: 5, SOUPE: 6, DETAIL: 7 };

/* Attribut d'encre constant, stocké décalé de 1 : 0 (la valeur par défaut d'un
   attribut absent) signifie « encre fournie par le matériau ou l'instance ». */
function encrer(geo, encre) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aEncre', new THREE.BufferAttribute(new Float32Array(n).fill(encre + 1), 1));
  g.setAttribute('aTapis', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

function fusion(liste) {
  const g = mergeGeometries(liste, false);
  liste.forEach((x) => x.dispose());
  return g;
}

/* Position sur le cercle : angle a = s / R. */
export function versXZ(s, r = R) {
  const a = s / R;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/* ---------------------------------------------------------------- Corniche */

/* Une corniche est un morceau d'anneau collé à la paroi, du rayon R_INT au mur. */
export function geoCorniche(s, l, y, ep, encre, tapis = 0) {
  const a0 = s / R, a1 = (s + l) / R;
  const n = Math.max(2, Math.ceil(l / 0.5));
  const pos = [], nor = [], enc = [], tap = [];
  const quad = (p0, p1, p2, p3, nx, ny, nz, e = encre, tp = 0) => {
    for (const p of [p0, p1, p2, p0, p2, p3]) {
      pos.push(...p);
      nor.push(nx, ny, nz);
      enc.push(e + 1);
      tap.push(tp);
    }
  };
  const pt = (a, r, h) => [Math.cos(a) * r, h, Math.sin(a) * r];
  const y0 = y - ep;
  const rMur = R_MUR + 0.05;
  for (let i = 0; i < n; i++) {
    const aa = a0 + ((a1 - a0) * i) / n, ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const am = (aa + ab) / 2;
    // dessus
    quad(pt(aa, R_INT, y), pt(aa, rMur, y), pt(ab, rMur, y), pt(ab, R_INT, y), 0, 1, 0, encre, tapis);
    // dessous
    quad(pt(aa, R_INT, y0), pt(ab, R_INT, y0), pt(ab, rMur, y0), pt(aa, rMur, y0), 0, -1, 0);
    // tranche intérieure (face au centre de la boîte)
    quad(pt(aa, R_INT, y0), pt(aa, R_INT, y), pt(ab, R_INT, y), pt(ab, R_INT, y0), -Math.cos(am), 0, -Math.sin(am));
    // bandeau de rive : une lèvre plus sombre sur le bord avant, pour lire la marche
    quad(pt(aa, R_INT - 0.02, y - 0.12), pt(aa, R_INT - 0.02, y + 0.001), pt(ab, R_INT - 0.02, y + 0.001), pt(ab, R_INT - 0.02, y - 0.12),
      -Math.cos(am), 0, -Math.sin(am), ENCRE.DETAIL);
  }
  // bouts
  const bout = (a, signe) => {
    const tx = -Math.sin(a) * signe, tz = Math.cos(a) * signe;
    if (signe < 0) quad(pt(a, R_INT, y0), pt(a, rMur, y0), pt(a, rMur, y), pt(a, R_INT, y), tx, 0, tz);
    else quad(pt(a, R_INT, y0), pt(a, R_INT, y), pt(a, rMur, y), pt(a, rMur, y0), tx, 0, tz);
  };
  bout(a0, -1);
  bout(a1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aEncre', new THREE.Float32BufferAttribute(enc, 1));
  g.setAttribute('aTapis', new THREE.Float32BufferAttribute(tap, 1));
  return g;
}

/* Grille de bouche de vapeur posée au milieu d'une corniche. */
function geoGrille(s, l, y) {
  const [x, z] = versXZ(s + l / 2, (R_INT + R_MUR) / 2 - 0.3);
  const g = encrer(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 10), ENCRE.DETAIL);
  g.translate(x, y + 0.06, z);
  return g;
}

/* Toutes les corniches immobiles du niveau en un seul maillage (un seul appel de dessin). */
export function geoCornichesFixes(corniches) {
  const morceaux = [];
  for (const c of corniches) {
    if (c.type === 'sol' || c.type === 'mobile' || c.type === 'fragile') continue;
    const encre = c.type === 'bouche' ? ENCRE.ACCENT : c.type === 'bord' ? ENCRE.DETAIL : ENCRE.CORNICHE;
    morceaux.push(geoCorniche(c.s, c.l, c.y, c.ep, encre, c.tapis || 0));
    if (c.type === 'bouche') morceaux.push(geoGrille(c.s, c.l, c.y));
  }
  return fusion(morceaux);
}

/* ------------------------------------------------------------- Paroi, fond */

export function geoParoi() {
  const seg = 72;
  const yb = -8, yh = HAUT_BOITE;
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, y) => [Math.cos(a) * R_MUR, y, Math.sin(a) * R_MUR];
    const n = (a) => [-Math.cos(a), 0, -Math.sin(a)];
    const sommets = [[a0, yb], [a0, yh], [a1, yh], [a0, yb], [a1, yh], [a1, yb]];
    for (const [a, y] of sommets) {
      pos.push(...p(a, y));
      nor.push(...n(a));
      uv.push(a / (Math.PI * 2), (y - yb) / (yh - yb));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const n = pos.length / 3;
  g.setAttribute('aEncre', new THREE.BufferAttribute(new Float32Array(n).fill(ENCRE.MUR + 1), 1));
  g.setAttribute('aTapis', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/* Fond, joints de soudure, tuyaux : le décor fixe de la boîte. */
export function geoDecorBoite(alea) {
  const m = [];
  // Le fond
  const fond = encrer(new THREE.CircleGeometry(R_MUR, 48), ENCRE.MUR);
  fond.rotateX(-Math.PI / 2);
  m.push(fond);
  // Joints : anneaux sombres tous les 24 m
  for (let y = 12; y < HAUT_BOITE; y += 24) {
    // Matériau double face : pas besoin d'orienter les triangles vers l'intérieur
    const anneau = encrer(new THREE.CylinderGeometry(R_MUR - 0.06, R_MUR - 0.06, 0.35, 72, 1, true), ENCRE.DETAIL);
    anneau.translate(0, y, 0);
    m.push(anneau);
  }
  // Tuyaux verticaux contre la paroi, avec colliers
  for (let i = 0; i < 6; i++) {
    const s = (i / 6) * C + alea.entre(0, 4);
    const [x, z] = versXZ(s, R_MUR - 0.32);
    const tuyau = encrer(new THREE.CylinderGeometry(0.22, 0.22, HAUT_BOITE + 8, 8, 1, true), ENCRE.ACCENT);
    tuyau.translate(x, HAUT_BOITE / 2 - 4, z);
    m.push(tuyau);
    for (let y = 3 + alea.entre(0, 5); y < HAUT_BOITE; y += 7) {
      const collier = encrer(new THREE.CylinderGeometry(0.29, 0.29, 0.18, 8), ENCRE.DETAIL);
      collier.translate(x, y, z);
      m.push(collier);
    }
  }
  return fusion(m);
}

/* LA MATRICE : la presse qui produit les exemplaires, au pied de la boîte.
   sens = −1 : le tapis part vers les s décroissants. */
export function geoMatrice(s, sens = 1) {
  const a = s / R;
  const m = [];
  const bloc = (w, h, d, x, y, z, encre) => {
    const g = encrer(new THREE.BoxGeometry(w, h, d), encre);
    g.translate(x, y, z);
    return g;
  };
  // Construit à plat face à +X puis tourné à l'angle voulu
  m.push(bloc(2.2, 7.5, 3.4, R_MUR - 1.1, 3.75, 0, ENCRE.DETAIL));       // bâti
  m.push(bloc(1.6, 0.6, 2.6, R_MUR - 2.3, 6.2, 0, ENCRE.MUR));           // tête de presse
  const piston = encrer(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10), ENCRE.MUR);
  piston.translate(R_MUR - 2.3, 4.8, 0);
  m.push(piston);
  m.push(bloc(1.7, 0.25, 2.8, R_MUR - 2.3, 3.5, 0, ENCRE.ACCENT));       // moule
  const voyant = encrer(new THREE.IcosahedronGeometry(0.28, 1), ENCRE.SOUPE);
  voyant.translate(R_MUR - 2.25, 7.1, 1.0);
  m.push(voyant);
  // Le tapis d'évacuation, très bas : le nouvel exemplaire y atterrit
  m.push(bloc(2.4, 0.1, 7.0, R_MUR - 1.6, 0.05, 4.2, ENCRE.DETAIL));
  for (let i = 0; i < 9; i++) {
    const rouleau = encrer(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 6), ENCRE.MUR);
    rouleau.rotateZ(Math.PI / 2);
    rouleau.translate(R_MUR - 1.6, 0.1, 1.0 + i * 0.8);
    m.push(rouleau);
  }
  const g = fusion(m);
  if (sens < 0) g.scale(1, 1, -1);
  g.rotateY(-a);
  return g;
}

/* Le couvercle arraché, plié vers l'extérieur, et la lèvre de la boîte. */
export function geoCouvercle() {
  const m = [];
  const levre = encrer(new THREE.TorusGeometry(R_MUR, 0.35, 6, 64), ENCRE.MUR);
  levre.rotateX(Math.PI / 2);
  levre.translate(0, HAUT_BOITE, 0);
  m.push(levre);
  // Disque aux bords déchiquetés
  const forme = new THREE.Shape();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R_MUR - 0.2 - (i % 2 ? 0.35 : 0) - Math.sin(i * 7.3) * 0.2;
    if (i === 0) forme.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else forme.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const disque = encrer(new THREE.ExtrudeGeometry(forme, { depth: 0.15, bevelEnabled: false }), ENCRE.MUR);
  // Couché dans le plan vertical x = 0, charnière en bas, puis basculé vers
  // l'extérieur et posé sur la lèvre : le couvercle arraché, relevé.
  disque.translate(-R_MUR, 0, 0);
  disque.rotateY(Math.PI / 2);
  disque.rotateX(-Math.PI / 2);
  disque.rotateZ(-0.42);
  disque.translate(R_MUR, HAUT_BOITE, 0);
  m.push(disque);
  return fusion(m);
}

/* Petite boîte de conserve décorative (et empilable). */
export function geoPetiteBoite() {
  const corps = encrer(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10), ENCRE.SOUPE);
  corps.translate(0, 0.25, 0);
  const bas = encrer(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 10), ENCRE.MUR);
  bas.translate(0, 0.035, 0);
  const haut = encrer(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 10), ENCRE.MUR);
  haut.translate(0, 0.465, 0);
  const bande = encrer(new THREE.CylinderGeometry(0.245, 0.245, 0.1, 10), ENCRE.FOND);
  bande.translate(0, 0.27, 0);
  return fusion([corps, bas, haut, bande]);
}

/* --------------------------------------------------------------- Mannequin */

/* Mannequin d'atelier, sans visage, avec une plaque matricule sur la poitrine.
   Hiérarchie d'articulations : la même sert au joueur (animé) et aux statues
   (pose figée, cuite en une seule géométrie pour l'instanciation). */
const ECHELLE = 0.88;

/* simple = version allégée pour les centaines de corps instanciés : rotules à
   8 faces au lieu de 32 (≈ 300 triangles par corps au lieu de 500). */
export function construireMannequin(materiau, materiauDetail, simple = false) {
  const racine = new THREE.Group();
  const art = {};
  const piece = (parent, geo, x, y, z, mat = materiau) => {
    const ms = new THREE.Mesh(geo, mat);
    ms.position.set(x, y, z);
    parent.add(ms);
    return ms;
  };
  const pivot = (parent, nom, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    art[nom] = g;
    return g;
  };
  const membre = (r, l) => {
    const g = new THREE.CylinderGeometry(r, r * 0.85, l, 6, 1, true);
    g.translate(0, -l / 2, 0);
    return g;
  };
  const rotule = (r) => new THREE.OctahedronGeometry(r, simple ? 0 : 1);

  const echelle = new THREE.Group();
  echelle.scale.setScalar(ECHELLE);
  racine.add(echelle);
  const bassin = pivot(echelle, 'bassin', 0, 0.92, 0);
  piece(bassin, new THREE.BoxGeometry(0.32, 0.16, 0.2), 0, 0, 0);
  const torse = pivot(bassin, 'torse', 0, 0.06, 0);
  const geoTorse = new THREE.CylinderGeometry(0.2, 0.15, 0.5, 4, 1);
  geoTorse.rotateY(Math.PI / 4);
  geoTorse.scale(1.05, 1, 0.62);
  piece(torse, geoTorse, 0, 0.27, 0);
  piece(torse, new THREE.BoxGeometry(0.15, 0.1, 0.03), 0, 0.33, 0.1, materiauDetail);
  const cou = pivot(torse, 'cou', 0, 0.53, 0);
  piece(cou, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), 0, 0.04, 0);
  piece(cou, new THREE.IcosahedronGeometry(0.135, 1), 0, 0.2, 0.01);
  for (const [cote, x] of [['G', 1], ['D', -1]]) {
    const ep = pivot(torse, `epaule${cote}`, x * 0.24, 0.45, 0);
    piece(ep, rotule(0.07), 0, 0, 0);
    piece(ep, membre(0.055, 0.28), 0, 0, 0);
    const co = pivot(ep, `coude${cote}`, 0, -0.29, 0);
    piece(co, rotule(0.055), 0, 0, 0);
    piece(co, membre(0.05, 0.26), 0, 0, 0);
    piece(co, new THREE.BoxGeometry(0.06, 0.12, 0.09), 0, -0.31, 0);
    const ha = pivot(bassin, `hanche${cote}`, x * 0.1, -0.05, 0);
    piece(ha, rotule(0.08), 0, 0, 0);
    piece(ha, membre(0.075, 0.42), 0, 0, 0);
    const ge = pivot(ha, `genou${cote}`, 0, -0.43, 0);
    piece(ge, rotule(0.07), 0, 0, 0);
    piece(ge, membre(0.065, 0.41), 0, 0, 0);
    piece(ge, new THREE.BoxGeometry(0.1, 0.06, 0.24), 0, -0.43, 0.05);
  }
  return { racine, art };
}

/* Poses en degrés. « av » = balancement vers l'avant, « ec » = écartement.
   Le genou plie vers l'arrière (valeur positive). */
export const POSES_DEF = [
  /* debout */   { torse: 0, cou: 0, epG: [8, 8], coG: 12, epD: [-6, 8], coD: 18, haG: [4, 3], geG: 4, haD: [-4, 3], geD: 6 },
  /* accroupi */ { torse: 32, cou: -18, epG: [-40, 12], coG: 30, epD: [-35, 12], coD: 35, haG: [78, 6], geG: 118, haD: [70, 6], geD: 112, bas: true },
  /* envol */    { torse: -6, cou: -12, epG: [165, 14], coG: 10, epD: [150, 18], coD: 20, haG: [22, 4], geG: 18, haD: [-24, 4], geD: 40 },
  /* sommet */   { torse: 4, cou: -22, epG: [70, 85], coG: 6, epD: [60, 85], coD: 8, haG: [10, 24], geG: 10, haD: [-8, 24], geD: 30 },
  /* chute */    { torse: -12, cou: 18, epG: [150, 50], coG: 50, epD: [130, 55], coD: 70, haG: [48, 10], geG: 78, haD: [20, 12], geD: 95 },
  /* cri */      { torse: -14, cou: -34, epG: [175, 22], coG: 4, epD: [175, 22], coD: 4, haG: [6, 8], geG: 8, haD: [-6, 8], geD: 8 },
  /* noyade */   { torse: 50, cou: 40, epG: [60, 10], coG: 120, epD: [60, 10], coD: 120, haG: [100, 6], geG: 140, haD: [100, 6], geD: 140 },
];

const D = Math.PI / 180;

/* Applique (ou mélange vers) une pose. f = 1 : pose atteinte. */
export function appliquerPose(art, p, f = 1) {
  const vers = (obj, axe, v) => { obj.rotation[axe] += (v - obj.rotation[axe]) * f; };
  vers(art.torse, 'x', p.torse * D);
  vers(art.cou, 'x', p.cou * D);
  for (const c of ['G', 'D']) {
    const s = c === 'G' ? 1 : -1;
    // vers l'avant = rotation négative autour de x (le membre pend vers −y, l'avant est +z)
    vers(art[`epaule${c}`], 'x', -p[`ep${c}`][0] * D);
    vers(art[`epaule${c}`], 'z', s * p[`ep${c}`][1] * D);
    vers(art[`coude${c}`], 'x', -p[`co${c}`] * D);
    vers(art[`hanche${c}`], 'x', -p[`ha${c}`][0] * D);
    vers(art[`hanche${c}`], 'z', s * p[`ha${c}`][1] * D);
    vers(art[`genou${c}`], 'x', p[`ge${c}`] * D);
  }
  // Accroupi : abaisser le bassin pour garder les pieds au sol
  const yBassin = p.bas ? 0.6 : 0.92;
  art.bassin.position.y += (yBassin - art.bassin.position.y) * f;
}

/* Cuisson d'une pose en une géométrie unique, pieds à y = 0, centrée en x/z. */
export function geoPose(indice) {
  const { racine, art } = construireMannequin(null, 'detail', true);
  appliquerPose(art, POSES_DEF[indice], 1);
  racine.updateMatrixWorld(true);
  const morceaux = [];
  racine.traverse((o) => {
    if (!o.isMesh) return;
    const g = encrer(o.geometry.clone(), o.material === 'detail' ? ENCRE.DETAIL : -1);
    g.applyMatrix4(o.matrixWorld);
    morceaux.push(g);
  });
  const g = fusion(morceaux);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return g;
}

/* ----------------------------------------------------------- Inscriptions */

/* Atlas de textes peints sur la paroi : une texture à un seul canal.
   255 = lettre franche (encre détail), 128 = filigrane (paroi assombrie). */
export function atlasTextes(textes) {
  const LARG = 2048;
  const lignes = textes.map((t) => ({ ...t, px: t.tour ? 300 : 110 }));
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const police = (px) => `${px}px Anton, Impact, "Arial Narrow", sans-serif`;
  let y = 0;
  for (const l of lignes) {
    ctx.font = police(l.px);
    l.largPx = Math.min(LARG - 8, Math.ceil(ctx.measureText(l.texte).width) + 24);
    l.y0 = y;
    y += l.px + 16;
  }
  cv.width = LARG;
  cv.height = THREE.MathUtils.ceilPowerOfTwo(y);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (const l of lignes) {
    ctx.font = police(l.px);
    ctx.textBaseline = 'top';
    const v = l.fort ? 255 : 128;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.save();
    if (l.miroir) {
      ctx.translate(12 + l.largPx - 24, 0);
      ctx.scale(-1, 1);
      ctx.fillText(l.texte, 0, l.y0 + 8);
    } else {
      ctx.fillText(l.texte, 12, l.y0 + 8);
    }
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const un = new Uint8Array(cv.width * cv.height);
  for (let i = 0; i < un.length; i++) un[i] = img[i * 4];
  const tex = new THREE.DataTexture(un, cv.width, cv.height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  // Bandes courbes collées à la paroi, une par texte (deux tours pour l'étiquette)
  const pos = [], nor = [], uv = [];
  const rP = R_MUR - 0.03;
  for (const l of lignes) {
    const hauteur = l.h;
    const largeur = (l.largPx / l.px) * hauteur;
    {
      const sCentre = l.s * (rP / R);
      const n = Math.max(2, Math.ceil(largeur / 0.8));
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const a0 = (sCentre + (u0 - 0.5) * largeur) / rP, a1 = (sCentre + (u1 - 0.5) * largeur) / rP;
        const yb = l.y - hauteur / 2, yh = l.y + hauteur / 2;
        const p = (a, yy) => [Math.cos(a) * rP, yy, Math.sin(a) * rP];
        // Vu de l'intérieur, l'angle croissant va vers la droite : le texte se lit à l'endroit
        const U = (u) => (12 + u * (l.largPx - 24)) / LARG;
        const Vb = (l.y0 + 8 + l.px) / cv.height, Vh = (l.y0 + 8) / cv.height;
        const sommets = [[a0, yb, U(u0), Vb], [a1, yb, U(u1), Vb], [a1, yh, U(u1), Vh], [a0, yb, U(u0), Vb], [a1, yh, U(u1), Vh], [a0, yh, U(u0), Vh]];
        for (const [a, yy, uu, vv] of sommets) {
          pos.push(...p(a, yy));
          nor.push(-Math.cos(a), 0, -Math.sin(a));
          uv.push(uu, vv);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return { geo: g, tex };
}

/* Bandeau de la gloire, en haut de la boîte : le nom de la personne célèbre. */
export function geoBandeauGloire() {
  const g = new THREE.CylinderGeometry(R_MUR - 0.08, R_MUR - 0.08, 2.6, 72, 1, true);
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), 0, -nrm.getZ(i));
  // Le texte se répète trois fois autour ; u inversé car on regarde de l'intérieur
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (1 - uv.getX(i)) * 3);
  g.translate(0, HAUT_BOITE - 3.2, 0);
  return g;
}
