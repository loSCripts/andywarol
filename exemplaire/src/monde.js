/* Passage du niveau (données) au monde physique (boîtes de collision). */
import { Monde } from './physique.js';

export function construireMonde(niveau, statues = []) {
  const m = new Monde();
  for (const c of niveau.corniches) {
    c.boite = m.ajouter({
      s: c.s, l: c.l, y0: c.y - c.ep, y1: c.y, type: c.type, corniche: c,
      tapis: c.tapis,
      mobile: c.type === 'mobile', amp: c.amp, periode: c.periode,
      fragile: c.type === 'fragile',
      bouche: c.type === 'bouche',
      phase: c.phase ?? 0,
    });
  }
  const o = niveau.obstacles;
  if (o) {
    for (const p of o.presses) p.boite = m.ajouterPresse(p);
    for (const c of o.chaines) m.ajouterChaine(c);
    for (const b of o.balanciers) m.ajouterBalancier(b);
  }
  m.majObstacles();
  for (const st of statues) st.boite = m.ajouterStatue(st);
  return m;
}
