/* Point d'entrée : écrans, commandes tactiles, bandeau, échanges serveur. */
import '@fontsource/anton/latin-400.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-700.css';
import './styles.css';
import { Imprimerie } from './rendu.js';
import { Son } from './son.js';
import { Jeu } from './jeu.js';
import { reseau, lire, ecrire } from './reseau.js';
import { MOTS, VIE_STATUE_H } from './constantes.js';
import { ZONES } from './niveau.js';

const $ = (id) => document.getElementById(id);
const ECRANS = ['ecran-titre', 'ecran-contrat', 'ecran-imprime', 'ecran-recycle', 'ecran-gloire', 'ecran-galerie', 'ecran-pause'];

function montrer(id) {
  for (const e of ECRANS) $(e).hidden = e !== id;
  $('hud').hidden = id !== null;
  if (id !== null) $('etiquette').hidden = true;
}

const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n);
const pad = (n, k = 2) => String(n).padStart(k, '0');
const numeroTexte = (n) => (n ? `N° ${String(n).padStart(6, '0').replace(/(\d{3})(\d{3})$/, '$1 $2')}` : 'N° ? — HORS LIGNE');

async function attendrePolices() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('110px Anton'), document.fonts.load('700 16px "Courier Prime"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* polices de secours */ }
}

await attendrePolices();

const imp = new Imprimerie($('toile'));
const son = new Son();
son.muet = lire('muet', false);

let numero = null;
let derniere = null;          // dernière statue imprimée
let gloireInfo = null;
let etatMonde = lire('etat', null);
let ecartHorloge = 0;         // heure serveur − heure locale
let pause = false;
let premierSaut = lire('premierSaut', false);
let derniereMajStatues = 0;
let statuesEnAttente = null;

const jeu = new Jeu(imp, son, {
  pseudo: () => lire('pseudo', '') || 'ANONYME',
  saut: () => {
    if (!premierSaut) { premierSaut = true; ecrire('premierSaut', true); consigne(null); }
  },
  planche: () => finDePlanche(),
  recycle: (hMax) => reseau.recycler(numero, hMax),
  gloire: async (duree) => { gloireInfo = await reseau.gloire(numero, duree); },
});
window.__exemplaire = { jeu, imp, reseau };

/* ------------------------------------------------------------- Monde */

async function rafraichirEtat() {
  const e = await reseau.etat();
  if (!e) return;
  etatMonde = e;
  ecartHorloge = Date.parse(e.serveur) - Date.now();
  afficherEtat();
}

function afficherEtat() {
  const e = etatMonde;
  $('hors-ligne').hidden = reseau.enLigne;
  if (!e) return;
  $('stats').textContent = `${nombre(e.produits)} PRODUITS · ${nombre(e.debout)} DEBOUT · ${nombre(e.recycles)} RECYCLÉS · ${nombre(e.sortis)} SORTIS`;
  const c = e.celebre;
  let bandeau;
  if (c) {
    const reste = Math.max(0, Math.round((Date.parse(c.fin) - (Date.now() + ecartHorloge)) / 60000));
    bandeau = `★ ${c.pseudo.toUpperCase()} (N° ${c.numero}) EST CÉLÈBRE — ENCORE ${reste} MIN ★ ${e.file ? `${e.file} EN FILE D'ATTENTE POUR LA GLOIRE` : ''}`;
    $('titre-celebre').textContent = `EN CE MOMENT, ${c.pseudo.toUpperCase()} EST CÉLÈBRE.`;
  } else {
    bandeau = 'PERSONNE N\'EST CÉLÈBRE. LA PLACE EST LIBRE. IL SUFFIT DE SORTIR DE LA BOÎTE.';
    $('titre-celebre').textContent = 'PERSONNE N\'EST CÉLÈBRE EN CE MOMENT.';
  }
  $('bandeau-texte').textContent = `${bandeau}   ·   ${nombre(e.debout)} CORPS DEBOUT   ·   ${nombre(e.produits)} EXEMPLAIRES PRODUITS`;
  jeu.ecrireGloire(c);
}

async function rafraichirStatues() {
  derniereMajStatues = Date.now();
  const liste = await reseau.statues();
  // Ne pas changer le monde sous les pieds de quelqu'un qui grimpe
  if (jeu.etat === 'jeu' && jeu.j.y > 18) statuesEnAttente = liste;
  else jeu.remplacerStatues(liste);
}

/* ------------------------------------------------------------- Parties */

function demarrerPartie() {
  son.debloquer();
  son.demarrerAmbiance();
  pause = false;
  if (statuesEnAttente) { jeu.remplacerStatues(statuesEnAttente); statuesEnAttente = null; }
  jeu.nouvellePartie();
  montrer(null);
  numero = null;
  derniere = null;
  gloireInfo = null;
  $('numero').textContent = 'N° …';
  reseau.nouvelExemplaire(lire('pseudo', '') || 'ANONYME').then((n) => {
    numero = n;
    $('numero').textContent = numeroTexte(n);
  });
  if (Date.now() - derniereMajStatues > 45000) rafraichirStatues();
  if (!premierSaut) consigne('TIRE VERS L\'ARRIÈRE,<br>LÂCHE : TU SAUTES.');
  else consigne(null);
}

let minuteurConsigne = null;
function consigne(html, duree = 0) {
  clearTimeout(minuteurConsigne);
  const c = $('consigne');
  if (!html) { c.hidden = true; return; }
  c.innerHTML = html;
  c.hidden = false;
  if (duree) minuteurConsigne = setTimeout(() => { c.hidden = true; }, duree);
}

async function imprimer() {
  if (jeu.etat !== 'jeu' || pause) return;
  const st = await jeu.imprimerCorps();
  if (!st) return;
  derniere = st;
  jeu.poserStatue(st);
  const serveur = await reseau.imprimer(numero, st);
  Object.assign(st, serveur);
}

function finDePlanche() {
  const mo = jeu.mort;
  if (!mo) return;
  if (mo.type === 'imprime') afficherImprime();
  else if (mo.type === 'recycle') {
    $('re-detail').textContent = `Exemplaire ${numeroTexte(numero).replace('N°', 'n°')}. Mort dans la soupe à ${jeu.hMax.toFixed(1).replace('.', ',')} m, après ${Math.round(jeu.duree)} secondes.`;
    montrer('ecran-recycle');
  } else if (mo.type === 'gloire') afficherGloire();
}

function afficherImprime() {
  const st = derniere;
  $('im-numero').textContent = `EXEMPLAIRE ${numeroTexte(numero)}`;
  const batt = st.batterie != null ? ` Batterie : ${st.batterie} %.` : '';
  $('im-detail').textContent = `${(lire('pseudo', '') || 'ANONYME').toUpperCase()}. Imprimé à ${st.y.toFixed(1).replace('.', ',')} m, à ${pad(st.heure)} h ${pad(st.minute)}.${batt}`;
  $('im-mot').textContent = st.mot;
  const choix = $('im-mots');
  choix.innerHTML = '';
  const proposes = [...MOTS].sort(() => Math.random() - 0.5).slice(0, 5);
  if (!proposes.includes(st.mot)) proposes[0] = st.mot;
  for (const m of proposes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m;
    if (m === st.mot) b.classList.add('choisi');
    b.onclick = () => {
      son.jouer('clic');
      for (const x of choix.children) x.classList.toggle('choisi', x === b);
      $('im-mot').textContent = m;
      reseau.signer(st, m);
    };
    choix.appendChild(b);
  }
  $('im-note').textContent = reseau.enLigne && !st.local
    ? `Ton corps reste debout ${VIE_STATUE_H} heures pour tout le monde. Ensuite, recyclage — sauf si quelqu'un l'achète.`
    : 'Hors ligne : ton corps ne sert qu\'à toi.';
  montrer('ecran-imprime');
}

let minuteurGloire = null;
function afficherGloire() {
  const pseudo = (lire('pseudo', '') || 'ANONYME').toUpperCase();
  montrer('ecran-gloire');
  clearInterval(minuteurGloire);
  const maj = () => {
    const g = gloireInfo;
    if (!g) { $('gl-detail').textContent = 'Envoi de ta gloire…'; return; }
    if (g.erreur) {
      $('gl-detail').textContent = g.erreur === 'hors_ligne'
        ? 'Tu es sorti. Mais hors ligne, personne ne l\'a vu.'
        : 'Le serveur doute de ta montée. Recommence, plus lentement.';
      $('gl-compte').textContent = '';
      return;
    }
    const maintenant = Date.now() + ecartHorloge;
    const debut = Date.parse(g.debut), fin = Date.parse(g.fin);
    if (maintenant < debut) {
      const s = Math.ceil((debut - maintenant) / 1000);
      $('gl-detail').textContent = `${pseudo}, tu es sorti. Ta gloire commence dans ${Math.ceil(s / 60)} min : ${g.attente} avant toi.`;
      $('gl-compte').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    } else if (maintenant < fin) {
      const s = Math.ceil((fin - maintenant) / 1000);
      $('gl-detail').textContent = `${pseudo}, ton nom brille en haut de la boîte, pour tout le monde. Profite.`;
      $('gl-compte').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    } else {
      $('gl-detail').textContent = 'C\'est fini. Tout le monde a déjà oublié.';
      $('gl-compte').textContent = '00:00';
    }
  };
  maj();
  minuteurGloire = setInterval(maj, 500);
  rafraichirEtat();
}

/* ------------------------------------------------------------- Étiquettes */

let etiquetteCourante = null;
function montrerEtiquette(st) {
  etiquetteCourante = st;
  $('et-numero').textContent = `EXEMPLAIRE N° ${st.numero}${st.mien ? ' — TOI' : ''}`;
  const batt = st.batterie != null ? ` Batterie : ${st.batterie} %.` : '';
  $('et-detail').textContent = `${String(st.pseudo || 'ANONYME').toUpperCase()}. Imprimé à ${Number(st.y).toFixed(1).replace('.', ',')} m, à ${pad(st.heure)} h ${pad(st.minute)}.${batt}`;
  $('et-mot').textContent = st.mot;
  const bouton = $('et-acheter');
  bouton.disabled = false;
  if (st.fondateur) {
    $('et-prix').textContent = 'Fondateur. Ne sera jamais recyclé. Pas à vendre.';
    bouton.hidden = true;
  } else {
    const h = Math.max(0, Math.round((Date.parse(st.expire_le) - (Date.now() + ecartHorloge)) / 3600e3));
    $('et-prix').textContent = `Acheté ${st.achats || 0} fois. Recyclage dans ${h} h.`;
    bouton.hidden = !!st.mien || !!st.local;
    bouton.textContent = reseau.dejaAchete(st.id) ? 'DÉJÀ ACHETÉ' : 'ACHETER (+12 H)';
    bouton.disabled = reseau.dejaAchete(st.id);
  }
  $('etiquette').hidden = false;
}

$('et-fermer').onclick = () => { $('etiquette').hidden = true; };
$('et-acheter').onclick = async () => {
  const st = etiquetteCourante;
  if (!st) return;
  son.jouer('clic');
  $('et-acheter').disabled = true;
  const { st: maj, erreur } = await reseau.acheter(st.id);
  if (maj) {
    Object.assign(st, { achats: maj.achats, expire_le: maj.expire_le });
    montrerEtiquette(st);
    son.jouer('imprimer');
    return;
  }
  const messages = {
    pas_soi_meme: 'On ne s\'achète pas soi-même.',
    deja_achete: 'Déjà acheté.',
    recycle: 'Trop tard : déjà dans la soupe.',
    trop_vite: 'Doucement.',
    hors_ligne: 'Hors ligne : rien à vendre.',
  };
  $('et-prix').textContent = messages[erreur] || 'Refusé.';
};

/* ------------------------------------------------------------- Commandes */

const toile = $('toile');
const elast = $('elastique');
let toucher = null;

toile.addEventListener('pointerdown', (e) => {
  son.debloquer();
  if (jeu.etat !== 'jeu' || pause || toucher) return;
  toucher = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
  toile.setPointerCapture(e.pointerId);
});

toile.addEventListener('pointermove', (e) => {
  if (!toucher || e.pointerId !== toucher.id) return;
  toucher.x = e.clientX;
  toucher.y = e.clientY;
  const dx = toucher.x - toucher.x0, dy = toucher.y - toucher.y0;
  if (Math.hypot(dx, dy) > 10) {
    $('etiquette').hidden = true;
    jeu.viser(dx, dy);
    elast.classList.add('actif');
    $('el-ligne').setAttribute('x1', toucher.x0);
    $('el-ligne').setAttribute('y1', toucher.y0);
    $('el-ligne').setAttribute('x2', toucher.x);
    $('el-ligne').setAttribute('y2', toucher.y);
    $('el-depart').setAttribute('cx', toucher.x0);
    $('el-depart').setAttribute('cy', toucher.y0);
    $('el-doigt').setAttribute('cx', toucher.x);
    $('el-doigt').setAttribute('cy', toucher.y);
  }
});

function finToucher(e, annule) {
  if (!toucher || e.pointerId !== toucher.id) return;
  const t = toucher;
  toucher = null;
  elast.classList.remove('actif');
  const d = Math.hypot(t.x - t.x0, t.y - t.y0);
  if (annule) { jeu.annulerVisee(); return; }
  if (d < 10 && performance.now() - t.t0 < 400) {
    jeu.annulerVisee();
    const st = jeu.corpsSous(t.x, t.y);
    if (st) { son.jouer('clic'); montrerEtiquette(st); } else $('etiquette').hidden = true;
    return;
  }
  jeu.lacher();
}
toile.addEventListener('pointerup', (e) => finToucher(e, false));
toile.addEventListener('pointercancel', (e) => finToucher(e, true));

const btnImprimer = $('btn-imprimer');
btnImprimer.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); imprimer(); });

function mettreEnPause() {
  if (jeu.etat !== 'jeu' || pause) return;
  pause = true;
  jeu.annulerVisee();
  montrer('ecran-pause');
  $('hud').hidden = true;
}

function reprendre() {
  pause = false;
  montrer(null);
}

function retourTitre() {
  pause = false;
  jeu.etat = 'titre';
  jeu.mort = null;
  son.etouffer(false);
  clearInterval(minuteurGloire);
  montrer('ecran-titre');
  rafraichirEtat();
}

$('btn-pause').onclick = mettreEnPause;
$('btn-reprendre').onclick = () => { son.jouer('clic'); reprendre(); };
$('btn-abandon').onclick = () => {
  // Abandonner, c'est finir dans la soupe : le serveur le note comme tel
  reseau.recycler(numero, jeu.hMax);
  retourTitre();
};

function majBoutonSon() {
  const t = son.muet ? 'SON : NON' : 'SON : OUI';
  $('btn-son').textContent = t;
  $('btn-son2').textContent = t;
}
const basculerSon = () => { son.debloquer(); ecrire('muet', son.basculerMuet()); majBoutonSon(); };
$('btn-son').onclick = basculerSon;
$('btn-son2').onclick = basculerSon;
majBoutonSon();

$('btn-jouer').onclick = () => {
  son.debloquer();
  son.jouer('clic');
  if (lire('pseudo', null) === null) { montrer('ecran-contrat'); $('pseudo').focus(); return; }
  demarrerPartie();
};
$('btn-contrat').onclick = () => { son.jouer('clic'); $('pseudo').value = lire('pseudo', '') || ''; montrer('ecran-contrat'); };
$('btn-signer').onclick = () => {
  son.debloquer();
  const p = $('pseudo').value.replace(/[^\p{L}\p{N} _'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  ecrire('pseudo', p);
  $('pseudo').blur();
  son.jouer('imprimer');
  demarrerPartie();
};
$('pseudo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-signer').click(); });
for (const id of ['btn-suivant-im', 'btn-suivant-re', 'btn-suivant-gl']) {
  $(id).onclick = () => { son.jouer('clic'); clearInterval(minuteurGloire); demarrerPartie(); };
}

$('btn-galerie').onclick = async () => {
  son.jouer('clic');
  montrer('ecran-galerie');
  jeu.etat = 'galerie';
  const ol = $('ga-liste');
  ol.innerHTML = '<li>Chargement…</li>';
  const liste = await reseau.galerie();
  ol.innerHTML = '';
  if (!liste) { ol.innerHTML = '<li>Hors ligne.</li>'; return; }
  if (!liste.length) { ol.innerHTML = '<li>Personne n\'a encore acheté de corps. Rien n\'a de valeur.</li>'; return; }
  for (const st of liste) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = `N° ${st.numero}`;
    const d = document.createElement('span');
    d.textContent = `${String(st.pseudo).toUpperCase()} — « ${st.mot} » — ${Number(st.y).toFixed(0)} m`;
    const p = document.createElement('span');
    p.className = 'prix';
    p.textContent = `×${st.achats}`;
    li.append(b, d, p);
    ol.appendChild(li);
  }
};
$('btn-retour-ga').onclick = () => { son.jouer('clic'); retourTitre(); };

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.key === 'p') { e.preventDefault(); imprimer(); }
  if (e.key === 'Escape') { if (pause) reprendre(); else mettreEnPause(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { mettreEnPause(); son.ctx?.suspend(); } else son.ctx?.resume();
});

window.addEventListener('resize', () => imp.redimensionner());

/* Bouton retour d'Android (appelé par l'appli) : renvoie true si géré. */
window.retourAndroid = () => {
  if (!$('etiquette').hidden) { $('etiquette').hidden = true; return true; }
  if (jeu.etat === 'jeu' && !pause) { mettreEnPause(); return true; }
  if (!$('ecran-titre').hidden) return false;
  retourTitre();
  return true;
};

/* ------------------------------------------------------------- Bandeau */

const hud = { hauteur: -1, zone: '', soupe: -1, aide: null, vide: false };
function majHud() {
  if (jeu.etat !== 'jeu' || pause) return;
  const i = jeu.infos();
  const h = Math.floor(i.hauteur);
  if (h !== hud.hauteur) { hud.hauteur = h; $('hauteur').textContent = h; }
  const z = ZONES[i.zone].nom;
  if (z !== hud.zone) { hud.zone = z; $('zone').textContent = z; }
  const s = Math.max(0, Math.round(i.soupe));
  if (s !== hud.soupe) {
    hud.soupe = s;
    $('jauge-soupe').style.height = `${Math.max(0, Math.min(1, 1 - i.soupe / 20)) * 100}%`;
    $('jauge-txt').textContent = `SOUPE −${s} M`;
  }
  const aide = i.aide?.texte || '';
  if (aide !== hud.aide) {
    hud.aide = aide;
    $('imprimer-aide').textContent = aide;
    btnImprimer.classList.toggle('utile', !!i.aide?.utile);
  }
  if (i.vide && !hud.vide) {
    hud.vide = true;
    if (!lire('vuVide', false)) {
      ecrire('vuVide', true);
      consigne('ICI, PERSONNE NE MONTE SEUL.<br>SAUTE, PUIS IMPRIME-TOI EN L\'AIR :<br>TON CORPS SERA UNE MARCHE.', 7000);
    }
  }
  if (!i.vide) hud.vide = false;
}

/* ------------------------------------------------------------- Boucle */

let dernier = performance.now();
function boucle(t) {
  const brut = t - dernier;
  dernier = t;
  if (!pause) {
    jeu.maj(Math.min(0.05, brut / 1000));
    jeu.dessiner();
    majHud();
  }
  imp.ajuster(brut, t);
  requestAnimationFrame(boucle);
}

$('chargement').hidden = true;
montrer('ecran-titre');
afficherEtat();
rafraichirEtat();
rafraichirStatues();
setInterval(() => { if (!document.hidden) rafraichirEtat(); }, 30000);
requestAnimationFrame(boucle);

// Hors ligne sur le site : un petit service worker garde le jeu en cache.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !location.hostname.endsWith('androidplatform.net')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
