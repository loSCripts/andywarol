import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererNiveau, escalierEntre } from '../src/niveau.js';
import { construireMonde } from '../src/monde.js';
import { explorer } from './accessibilite.js';
import { Y_GLOIRE } from '../src/constantes.js';

const niveau = genererNiveau();

test('le niveau est identique à chaque génération (même graine)', () => {
  const autre = genererNiveau();
  assert.deepEqual(
    autre.corniches.map((c) => [c.s, c.y, c.l, c.type]),
    niveau.corniches.map((c) => [c.s, c.y, c.l, c.type]),
  );
  assert.equal(autre.fondateurs.length, niveau.fondateurs.length);
});

test('le bord de la boîte est au-dessus de la hauteur de gloire', () => {
  const bord = niveau.vide.at(-1);
  assert.equal(bord.type, 'bord');
  assert.ok(bord.y >= Y_GLOIRE);
});

test('avec les fondateurs : tout le chemin jusqu’à la 4e marche du vide est accessible', () => {
  const monde = construireMonde(niveau, niveau.fondateurs);
  const sol = niveau.corniches[0].boite;
  const { atteintes } = explorer(monde, sol);
  const manquantes = niveau.chemin.filter((c) => !c.vide && !atteintes.has(c.boite));
  assert.deepEqual(manquantes.map((c) => `${c.type}@${c.y.toFixed(1)}`), []);
  for (let i = 0; i < 4; i++) {
    assert.ok(atteintes.has(niveau.vide[i].boite), `marche du vide n°${i + 1} (${niveau.vide[i].y.toFixed(1)} m) inaccessible`);
  }
  // Mais pas plus loin : la suite doit être construite par les joueurs
  const plusHaute = Math.max(...[...atteintes].map((b) => b.y1));
  assert.ok(plusHaute < niveau.vide[4].y, `on atteint ${plusHaute.toFixed(1)} m sans aide`);
});

test('sans aucun corps, le vide est infranchissable', () => {
  const monde = construireMonde(niveau, []);
  const sol = niveau.corniches[0].boite;
  const { atteintes } = explorer(monde, sol);
  assert.ok(!atteintes.has(niveau.vide[0].boite));
});

test('les corps des joueurs permettent de monter jusqu’au bord', () => {
  // On simule une communauté qui pose ses corps comme les fondateurs, marche après marche
  const corps = [...niveau.fondateurs];
  for (let i = 3; i < niveau.vide.length - 1; i++) {
    if (niveau.vide[i].type === 'bouche') continue;
    corps.push(...escalierEntre(niveau.vide[i], niveau.vide[i + 1]));
  }
  const monde = construireMonde(niveau, corps);
  const { atteintes } = explorer(monde, niveau.corniches[0].boite);
  assert.ok(atteintes.has(niveau.vide.at(-1).boite), 'le bord reste inaccessible');
});
