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
const numeroTexte = (n) => {
  if (!n) return 'N° ? — HORS LIGNE';
  const t = `N° ${String(n).padStart(6, '0').replace(/(\d{3})(\d{3})$/, '$1 $2')}`;
  return reseau.seul ? `${t} · SEUL` : t;
};

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
let generationStatues = 0;    // pour ignorer une réponse arrivée après un changement de mode
let modeCharge = null;        // mode des corps actuellement dans le monde

const jeu = new Jeu(imp, son, {
  pseudo: () => lire('pseudo', '') || 'ANONYME',
  saut: () => {
    if (!premierSaut) { premierSaut = true; ecrire('premierSaut', true); consigne(null); }
  },
  planche: () => finDePlanche(),
  recycle: (hMax) => { finDePartie(); reseau.recycler(numero, hMax); },
  gloire: async (duree) => { finDePartie(); gloireInfo = await reseau.gloire(numero, duree); },
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
  if (reseau.seul) afficherEtatSeul();
}

/* Mode seul : le bandeau et le haut de la boîte parlent du monde de ce téléphone. */
function afficherEtatSeul() {
  const s = reseau.etatSeul();
  $('bandeau-texte').textContent = `MODE SEUL · TES CORPS NE SERVENT QU'À TOI · ${nombre(s.debout)} CORPS DEBOUT · ${nombre(s.produits)} EXEMPLAIRES PRODUITS · ${nombre(s.recycles)} RECYCLÉS · PERSONNE NE TE REGARDE`;
  jeu.ecrireGloire('★ PERSONNE NE TE REGARDE ★');
}

async function rafraichirStatues() {
  derniereMajStatues = Date.now();
  const generation = ++generationStatues;
  const mode = reseau.mode;
  const liste = await reseau.statues();
  if (generation !== generationStatues || mode !== reseau.mode) return;
  modeCharge = mode;
  // Ne pas changer le monde sous les pieds de quelqu'un qui grimpe
  if (jeu.etat === 'jeu' && jeu.j.y > 18) statuesEnAttente = liste;
  else jeu.remplacerStatues(liste);
}

/* Changer de mode vide tout de suite le monde des corps de l'autre mode. */
function changerMode(mode) {
  reseau.choisirMode(mode);
  if (modeCharge === reseau.mode) return;
  statuesEnAttente = null;
  jeu.remplacerStatues([]);
  modeCharge = reseau.mode;
  rafraichirStatues();
}

/* ------------------------------------------------------------- Parties */

function demarrerPartie() {
  const precedent = jeu.mort?.type === 'imprime' ? jeu.mort.statue : null;
  clearTimeout(filetFin);
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
  const pour = reseau.mode;
  reseau.nouvelExemplaire(lire('pseudo', '') || 'ANONYME').then((n) => {
    if (pour !== reseau.mode) return;
    numero = n;
    $('numero').textContent = numeroTexte(n);
  });
  afficherEtat();
  if (Date.now() - derniereMajStatues > 45000) rafraichirStatues();
  if (!premierSaut && !jeu.dev.actif) consigne('TIRE VERS L\'ARRIÈRE,<br>LÂCHE : TU SAUTES.');
  else if (precedent) consigne(`TON CORPS PRÉCÉDENT EST FIGÉ À ${Math.max(0, Math.round(precedent.y))} M.<br>MONTE DESSUS.`, 5000);
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

function imprimer() {
  if (jeu.etat !== 'jeu' || pause) return;
  const st = jeu.imprimerCorps();
  if (!st) return;
  derniere = st;
  jeu.poserStatue(st);
  finDePartie();
  reseau.imprimer(numero, st).then((serveur) => Object.assign(st, serveur));
}

/* Pendant l'animation de fin, plus de bouton à toucher : seulement l'écran,
   pour passer directement à la suite. Dernier filet : si l'animation 3D ne
   va pas au bout (quelle qu'en soit la raison), l'écran suivant vient quand même. */
let filetFin = null;
function finDePartie() {
  clearTimeout(filetFin);
  filetFin = setTimeout(() => {
    try { jeu.passerFin(); } catch (e) { console.error(e); retourTitre(); }
  }, 6000);
  $('hud').hidden = true;
  $('etiquette').hidden = true;
  consigne(null);
  elast.classList.remove('actif');
  toucher = null;
}

function finDePlanche() {
  const mo = jeu.mort;
  if (!mo) return;
  if (mo.type === 'imprime') afficherImprime();
  else if (mo.type === 'recycle') {
    const ecrase = mo.cause === 'ecrase';
    const ex = `Exemplaire ${numeroTexte(numero).replace('N°', 'n°')}`;
    const h = (ecrase ? jeu.j.y : jeu.hMax).toFixed(1).replace('.', ',');
    $('re-titre').textContent = ecrase ? 'ÉCRASÉ' : 'RECYCLÉ';
    $('re-detail').textContent = ecrase
      ? `${ex}. Écrasé par une presse à ${h} m, après ${Math.round(jeu.duree)} secondes.`
      : `${ex}. Mort dans la soupe à ${h} m, après ${Math.round(jeu.duree)} secondes.`;
    $('re-morale').textContent = ecrase
      ? 'Elle avait prévenu. Elle tremble toujours avant de tomber.'
      : 'Il n\'a servi à rien. La soupe, elle, est meilleure.';
    montrer('ecran-recycle');
  } else if (mo.type === 'gloire') afficherGloire();
}

function afficherImprime() {
  const st = jeu.mort?.statue || derniere;
  if (!st) { montrer('ecran-titre'); return; }
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
  if (reseau.seul) {
    $('im-note').textContent = `Mode seul : ton corps reste figé ici ${VIE_STATUE_H} heures, sur ce téléphone. C'est une marche pour tes prochains exemplaires, et pour personne d'autre.`;
  } else {
    $('im-note').textContent = reseau.enLigne && !st.local
      ? `Ton corps reste figé ici ${VIE_STATUE_H} heures, pour tous les joueurs : c'est une marche, le suivant pourra monter dessus. Ensuite, recyclage — sauf si quelqu'un l'achète.`
      : 'Ton corps reste figé ici : c\'est une marche, le suivant pourra monter dessus. Hors ligne, il ne sert qu\'à toi.';
  }
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
      $('gl-detail').textContent = g.erreur === 'seul'
        ? (reseau.mode === 'dev' ? 'Mode développeur : sorti, et rien n\'est envoyé.' : 'Tu es sorti. Mais en mode seul, personne ne l\'a vu.')
        : g.erreur === 'hors_ligne'
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
    if (reseau.seul) $('et-prix').textContent = `Mode seul : ce corps n'existe que sur ce téléphone. Recyclage dans ${h} h.`;
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
  // Pendant une fin, toucher l'écran passe l'animation (pas tout de suite : évite un double toucher)
  if (jeu.mort && !jeu.mort.fini) { if (jeu.mort.t > 0.4) jeu.passerFin(); return; }
  if (jeu.etat !== 'jeu' || pause || toucher) return;
  toucher = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
  toile.setPointerCapture(e.pointerId);
});

toile.addEventListener('pointermove', (e) => {
  if (!toucher || e.pointerId !== toucher.id) return;
  const px = toucher.x, py = toucher.y;
  toucher.x = e.clientX;
  toucher.y = e.clientY;
  const dx = toucher.x - toucher.x0, dy = toucher.y - toucher.y0;
  if (jeu.dev.actif && jeu.dev.vol) {
    // vol libre : le joueur suit le doigt, pas de fronde
    toucher.vol = true;
    jeu.deplacerVol(toucher.x - px, toucher.y - py);
    return;
  }
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
  if (annule || t.vol) { jeu.annulerVisee(); return; }
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
  clearTimeout(filetFin);
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

function jouer(mode) {
  son.debloquer();
  son.jouer('clic');
  changerMode(mode);
  if (lire('pseudo', null) === null) { montrer('ecran-contrat'); $('pseudo').focus(); return; }
  demarrerPartie();
}
$('btn-jouer-ligne').onclick = () => jouer('en-ligne');
$('btn-jouer-seul').onclick = () => jouer('seul');
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
  // La prochaine image est demandée d'abord : une erreur ne peut plus arrêter le jeu
  requestAnimationFrame(boucle);
  const brut = t - dernier;
  dernier = t;
  try {
    if (!pause) {
      jeu.maj(Math.min(0.05, brut / 1000));
      jeu.dessiner();
      majHud();
    }
    imp.ajuster(brut, t);
  } catch (e) {
    console.error(e);
  }
}

/* ------------------------------------------------------------- Essai */

/* Mode essai (?essai=1), lancé par l'essai automatique sur téléphone virtuel :
   une séquence complète jouée avec les vraies fonctions du jeu, sans réseau.
   Chaque étape attend son écran ; le résultat part dans la console, que
   l'appli recopie dans le journal Android. */
async function essaiAutomatique() {
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const attendreQue = async (cond, ms, quoi) => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${quoi}`);
      await attendre(100);
    }
  };
  const ok = (m) => console.info(`[essai] ${m}`);
  const miens = () => jeu.statues.filter((st) => st.mien).length;
  const partie = async (quoi) => {
    demarrerPartie();
    await attendreQue(() => jeu.etat === 'jeu' && !$('hud').hidden, 4000, `${quoi} lancée`);
    await attendre(1500);
  };
  const imprimerEtAttendre = async (quoi, enSaut) => {
    if (enSaut) { jeu.viser(-30, 90); jeu.lacher(); await attendre(250); }
    imprimer();
    await attendreQue(() => !$('ecran-imprime').hidden, 10000, `écran « imprimé » (${quoi})`);
    ok(`${quoi} : écran « imprimé » affiché, bouton SUIVANT présent`);
    await attendre(600);
  };
  // Se poser sous une presse au moment où elle commence à trembler
  const sousUnePresse = () => {
    const p = jeu.niveau.obstacles.presses[0];
    jeu.teleporter(jeu.niveau.corniches[p.corniche]);
    jeu.j.s = p.s;
    jeu.soupe = jeu.j.y - 30;
    return p;
  };
  try {
    ecrire('pseudo', 'ESSAI');
    for (const k of Object.keys(localStorage)) {
      if (/^exemplaire\.(mesCorps|corpsSeul|corpsDev|compteur|stats)/.test(k)) localStorage.removeItem(k);
    }

    if (jeu.dev.actif) {
      // Appli des développeurs : téléportations, invincibilité, vol, communauté simulée, gloire
      await partie('partie dev');
      // toutes les destinations sauf le bord (qui fait sortir de la boîte : testé à la fin)
      for (const b of [...$('dev-zones').children].slice(0, -1)) {
        b.click();
        await attendre(500);
        if (jeu.etat !== 'jeu') throw new Error(`téléportation « ${b.textContent} » : la partie s'est arrêtée`);
      }
      ok(`${$('dev-zones').children.length - 1} téléportations, aucune mort`);
      sousUnePresse();
      await attendre(5000);
      if (jeu.etat !== 'jeu') throw new Error('invincible, mais écrasé par la presse');
      ok('invincible : la presse ne tue pas');
      document.querySelector('[data-outil="vol"]').click();
      const y0 = jeu.j.y;
      jeu.deplacerVol(0, -200);
      await attendre(300);
      if (!(jeu.j.y > y0 + 4)) throw new Error('le vol libre ne fait pas monter');
      document.querySelector('[data-outil="vol"]').click();
      ok('vol libre');
      document.querySelector('[data-outil="communaute"]').click();
      if (!jeu.statues.some((st) => st.simule)) throw new Error('pas de corps simulés');
      ok(`communauté simulée : ${jeu.statues.filter((st) => st.simule).length} corps`);
      [...$('dev-zones').children].at(-1).click();
      await attendreQue(() => !$('ecran-gloire').hidden, 8000, 'écran « célèbre » en arrivant au bord');
      ok('bord atteint : écran « célèbre »');
      $('btn-suivant-gl').click();
      await attendreQue(() => jeu.etat === 'jeu', 3000, 'nouvelle partie après la gloire');
    } else {
      // Mode seul : deux corps, dont un en plein saut
      changerMode('seul');
      await partie('partie seule 1');
      // Sur un téléphone lent, la chute depuis la presse peut durer plus que 1,5 s
      await attendreQue(() => jeu.j.sol, 8000, 'atterrissage du nouvel exemplaire');
      if (jeu.j.sol !== jeu.niveau.depart.boite) {
        throw new Error(`le joueur n'est pas sur la corniche la plus basse (sur : ${jeu.j.sol?.type ?? 'rien'}, y = ${jeu.j.y.toFixed(2)})`);
      }
      ok(`départ sur la corniche la plus basse (${jeu.niveau.depart.y.toFixed(1)} m)`);
      await imprimerEtAttendre('seul, impression 1', true);
      await partie('partie seule 2');
      await imprimerEtAttendre('seul, impression 2', false);

      // En ligne (réseau coupé par l'essai) : les corps du mode seul ne doivent pas y être
      changerMode('en-ligne');
      await partie('partie en ligne');
      await attendreQue(() => miens() === 0, 3000, 'monde en ligne sans les corps du mode seul');
      ok('en ligne : aucun corps du mode seul');
      await imprimerEtAttendre('en ligne, impression', false);

      // Retour au mode seul : ses deux corps, et pas celui d'en ligne
      changerMode('seul');
      await partie('retour au mode seul');
      await attendreQue(() => miens() === 2, 3000, 'les deux corps du mode seul, sans celui d\'en ligne');
      ok('seul : ses deux corps, sans celui d\'en ligne');

      // Écrasé sous une presse
      sousUnePresse();
      await attendreQue(() => !$('ecran-recycle').hidden, 9000, 'écran « écrasé »');
      if ($('re-titre').textContent !== 'ÉCRASÉ') throw new Error(`écran « ${$('re-titre').textContent} » au lieu de « ÉCRASÉ »`);
      ok('presse : écran « écrasé » affiché');
      await partie('après l\'écrasement');

      jeu.soupe = jeu.j.y + 1;
      await attendreQue(() => !$('ecran-recycle').hidden, 10000, 'écran « recyclé »');
      ok('noyade : écran « recyclé » affiché');
    }
    demarrerPartie();
    const h0 = jeu.horloge;
    await attendre(1500);
    if (!(jeu.horloge > h0) || jeu.etat !== 'jeu') throw new Error('la boucle du jeu est arrêtée');
    ok('ESSAI OK');
  } catch (e) {
    console.error(`[essai] ESSAI ÉCHEC : ${e.message}`);
  }
}

/* ------------------------------------------------------------- Développeur */

/* Appli EXEMPLAIRE DEV (ou ?dev=1) : voir tout le niveau sans perdre.
   Aucun échange avec le serveur, des corps à part ; rien de ce qu'on fait ici
   n'atteint le monde des joueurs. */
function installerModeDev() {
  reseau.modeDev();
  jeu.dev.actif = true;
  modeCharge = null;
  $('tampon-dev').hidden = false;
  $('btn-jouer-dev').hidden = false;
  document.querySelector('.modes').hidden = true;
  $('btn-galerie').hidden = true;
  $('btn-jouer-dev').onclick = () => {
    son.debloquer();
    son.jouer('clic');
    if (lire('pseudo', null) === null) ecrire('pseudo', 'DEV');
    demarrerPartie();
  };
  // Destinations : départ, chaque palier de 15 m, le vide, la 4e marche du vide, le bord
  const n = jeu.niveau;
  const pres = (y) => n.chemin.reduce((m, c) => (Math.abs(c.y - y) < Math.abs(m.y - y) ? c : m));
  const destinations = [['DÉPART', n.depart], ...[15, 30, 45, 60, 75].map((h) => [`${h} M`, pres(h)]),
    ['VIDE', n.p0], ['VIDE 4', n.vide[3]], ['BORD', n.vide.at(-1)]];
  for (const [nom, c] of destinations) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = nom;
    b.onclick = (e) => { e.stopPropagation(); if (jeu.etat === 'jeu') jeu.teleporter(c); };
    $('dev-zones').appendChild(b);
  }
  const outils = { infos: false };
  const majBoutons = () => {
    for (const b of document.querySelectorAll('[data-outil]')) {
      const o = b.dataset.outil;
      b.classList.toggle('actif', o === 'infos' ? outils.infos : !!jeu.dev[o]);
    }
    $('dev-infos').hidden = !outils.infos;
  };
  for (const b of document.querySelectorAll('[data-outil]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      const o = b.dataset.outil;
      if (o === 'infos') outils.infos = !outils.infos;
      else if (o === 'communaute') jeu.basculerCommunaute(!jeu.dev.communaute);
      else jeu.dev[o] = !jeu.dev[o];
      jeu.appliquerDev();
      majBoutons();
    };
  }
  majBoutons();
  let images = 0, t0 = performance.now();
  setInterval(() => {
    const ips = (images * 1000) / (performance.now() - t0);
    images = 0;
    t0 = performance.now();
    $('dev').hidden = jeu.etat !== 'jeu' || pause;
    if (!outils.infos || jeu.etat !== 'jeu') return;
    const i = jeu.infosDev();
    $('dev-infos').textContent = `s ${i.s.toFixed(1)} · y ${i.y.toFixed(1)} · zone ${i.zone} · ${ips.toFixed(0)} i/s
${i.appels} appels · ${(i.triangles / 1000).toFixed(0)} k triangles · ${i.corps} corps
échelle ${i.echelle.toFixed(2)} · ratio ${i.ratio}`;
  }, 250);
  const compter = () => { images++; requestAnimationFrame(compter); };
  requestAnimationFrame(compter);
}

$('chargement').hidden = true;
montrer('ecran-titre');
const modeEssai = new URLSearchParams(location.search).has('essai');
const modeDev = new URLSearchParams(location.search).has('dev');
if (modeEssai) reseau.coupe = true;
if (modeDev) installerModeDev();
afficherEtat();
rafraichirEtat();
rafraichirStatues();
if (modeEssai) essaiAutomatique();
setInterval(() => { if (!document.hidden) rafraichirEtat(); }, 30000);
requestAnimationFrame(boucle);

// Hors ligne sur le site : un petit service worker garde le jeu en cache.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !location.hostname.endsWith('androidplatform.net')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
