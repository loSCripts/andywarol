import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Monde, creerJoueur, pas, etatPresse, ecart } from '../src/physique.js';
import { C } from '../src/constantes.js';

const DT = 1 / 120;

/* Une corniche de 6 m à 10 m de haut, une presse au milieu (s = 3). */
function mondePresse() {
  const m = new Monde();
  const sol = m.ajouter({ s: 0, l: 6, y0: 9.5, y1: 10, type: 'fixe' });
  const presse = { s: 3, l: 1.4, yBas: 10, yHaut: 14.4, periode: 3.4, phase: 0 };
  m.ajouterPresse(presse);
  m.majObstacles();
  return { m, sol, presse };
}

function poser(j, b) { j.sol = b; j.y = b.y1; }

function avancer(m, j, duree, evts = []) {
  for (let t = 0; t < duree; t += DT) { m.avancer(DT); pas(j, m, DT, evts); }
  return evts;
}

test('la presse écrase le joueur qui reste dessous', () => {
  const { m, sol } = mondePresse();
  const j = creerJoueur(3, 10);
  poser(j, sol);
  const evts = avancer(m, j, 3.4);
  assert.ok(j.ecrase, 'le joueur sous la presse aurait dû être écrasé');
  assert.ok(evts.includes('ecrase'));
});

test('à côté de la presse, rien ne se passe', () => {
  const { m, sol } = mondePresse();
  const j = creerJoueur(0.8, 10);
  poser(j, sol);
  avancer(m, j, 7);
  assert.ok(!j.ecrase);
  assert.equal(j.sol, sol);
});

test('la presse prévient : elle tremble 0,5 s avant de tomber', () => {
  const p = { yBas: 10, yHaut: 14.4, periode: 3.4, phase: 0 };
  const phases = [];
  for (let t = 0; t < 3.4; t += 0.05) phases.push(etatPresse(p, t).phase);
  const iTremble = phases.indexOf('tremble'), iDescend = phases.indexOf('descend');
  assert.ok(iTremble >= 0 && iDescend > iTremble);
  assert.ok((iDescend - iTremble) * 0.05 >= 0.45, 'le tremblement doit précéder la chute d’au moins 0,45 s');
});

test('invincible (mode développeur) : pas d’écrasement, et on est repoussé hors de la presse', () => {
  const { m, sol } = mondePresse();
  const j = creerJoueur(3, 10);
  j.invincible = true;
  poser(j, sol);
  avancer(m, j, 3.4);
  assert.ok(!j.ecrase);
  const b = m.presses[0];
  const dedans = Math.abs(ecart(b.s + b.l / 2, j.s)) < b.l / 2 + 0.3 && j.y < b.y1 && j.y + 1.6 > b.y0;
  assert.ok(!dedans, 'le joueur ne doit pas rester coincé dans la presse');
});

test('un corps de la chaîne bouscule le joueur dans son sens de marche, une seule fois', () => {
  const m = new Monde();
  const sol = m.ajouter({ s: 0, l: C, y0: -0.5, y1: 0, type: 'sol' });
  // Un seul corps suspendu, déjà sur le joueur : le contact dure plusieurs
  // images, sans immunité il frapperait à chacune
  m.ajouterChaine({ y: 2.6, nombre: 1, espacement: C, vitesse: 1.5, s0: 6 });
  m.majObstacles();
  const j = creerJoueur(6.05, 0);
  poser(j, sol);
  const coups = [];
  for (let k = 0; k < 120 * 4; k++) {
    const evts = [];
    m.avancer(DT);
    pas(j, m, DT, evts);
    if (evts.includes('heurt')) {
      if (!coups.length) {
        assert.ok(j.vs > 0, 'poussé dans le sens de la chaîne');
        assert.equal(j.sol, null, 'le joueur décolle');
      }
      coups.push(k * DT);
    }
  }
  assert.ok(coups.length >= 1, 'le corps suspendu aurait dû toucher le joueur');
  for (let i = 1; i < coups.length; i++) {
    assert.ok(coups[i] - coups[i - 1] >= 0.6 - 1e-9, `deux coups à ${(coups[i] - coups[i - 1]).toFixed(2)} s d'écart : l'immunité ne marche pas`);
  }
});
