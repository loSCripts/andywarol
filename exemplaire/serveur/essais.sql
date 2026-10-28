-- Essais du serveur, à jouer sur une base de test (jamais en production) :
--   psql -v ON_ERROR_STOP=1 -f serveur/schema.sql -f serveur/essais.sql
-- Chaque bloc doit afficher OK ; une exception non rattrapée arrête tout.
set role anon;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  ex json; st json; st2 json; e text; g json; n bigint;
begin
  -- Les tables sont fermées
  begin perform * from public.statues; raise exception 'ECHEC: table lisible';
  exception when insufficient_privilege then raise notice 'OK tables fermees'; end;

  ex := public.nouvel_exemplaire(a, '  Ila<script>  ');
  n := (ex->>'numero')::bigint;
  if n < 101 then raise exception 'ECHEC numero %', n; end if;
  raise notice 'OK numero % (pseudo nettoye)', n;

  -- Téléportation : 140 m une seconde après la naissance
  begin perform public.imprimer(a, n, 10, 140, 2, 1, 'encore', 3, 12, 9);
    raise exception 'ECHEC: teleportation acceptee';
  exception when raise_exception then
    if sqlerrm <> 'trop_rapide' then raise; end if; raise notice 'OK teleportation refusee';
  end;

  -- Hors limites
  begin perform public.imprimer(a, n, 99, 5, 2, 1, 'encore', 3, 12, 9); raise exception 'ECHEC hors limites';
  exception when raise_exception then if sqlerrm <> 'hors_limites' then raise; end if; raise notice 'OK hors limites'; end;

  -- Exemplaire d'un autre appareil
  begin perform public.imprimer(b, n, 10, 5, 2, 1, 'encore', 3, 12, 9); raise exception 'ECHEC vol exemplaire';
  exception when raise_exception then if sqlerrm <> 'exemplaire_inconnu' then raise; end if; raise notice 'OK vol refuse'; end;

  -- Impression normale, mot hors liste remplacé, pose bornée
  st := public.imprimer(a, n, 10, 5, 99, -3, 'insulte libre', 3, 12, 250);
  if st->>'mot' = 'insulte libre' or (st->>'pose')::int <> 5 or (st->>'face')::int <> -1 or st->>'batterie' is not null then
    raise exception 'ECHEC nettoyage %', st;
  end if;
  raise notice 'OK statue % mot=%', st->>'id', st->>'mot';

  -- Deux impressions du même exemplaire
  begin perform public.imprimer(a, n, 11, 5, 2, 1, 'encore', 3, 12, 9); raise exception 'ECHEC double';
  exception when raise_exception then if sqlerrm <> 'deja_fini' then raise; end if; raise notice 'OK double refuse'; end;

  -- Signer : une fois, mot de la liste, pas le corps d'un autre
  begin perform public.signer(b, (st->>'id')::bigint, 'merci'); raise exception 'ECHEC signature volee';
  exception when raise_exception then if sqlerrm <> 'trop_tard' then raise; end if; end;
  begin perform public.signer(a, (st->>'id')::bigint, 'connard'); raise exception 'ECHEC mot libre';
  exception when raise_exception then if sqlerrm <> 'mot_interdit' then raise; end if; end;
  st2 := public.signer(a, (st->>'id')::bigint, 'merci');
  if st2->>'mot' <> 'merci' then raise exception 'ECHEC signer'; end if;
  begin perform public.signer(a, (st->>'id')::bigint, 'rien'); raise exception 'ECHEC resigner';
  exception when raise_exception then if sqlerrm <> 'trop_tard' then raise; end if; end;
  raise notice 'OK signature';

  -- Acheter : pas soi-même, une seule fois, +12 h
  begin perform public.acheter(a, (st->>'id')::bigint); raise exception 'ECHEC achat de soi';
  exception when raise_exception then if sqlerrm <> 'pas_soi_meme' then raise; end if; end;
  st2 := public.acheter(b, (st->>'id')::bigint);
  if (st2->>'achats')::int <> 1 or (st2->>'expire_le')::timestamptz < now() + interval '59 hours' then raise exception 'ECHEC achat %', st2; end if;
  begin perform public.acheter(b, (st->>'id')::bigint); raise exception 'ECHEC double achat';
  exception when raise_exception then if sqlerrm <> 'deja_achete' then raise; end if; end;
  raise notice 'OK achats';

  -- Gloire trop rapide
  ex := public.nouvel_exemplaire(b, 'Bob');
  begin perform public.revendiquer_gloire(b, (ex->>'numero')::bigint, 40); raise exception 'ECHEC gloire eclair';
  exception when raise_exception then if sqlerrm <> 'trop_rapide' then raise; end if; raise notice 'OK gloire eclair refusee'; end;

  -- Recycler
  perform public.recycler(b, (ex->>'numero')::bigint, 33.3);
  begin perform public.revendiquer_gloire(b, (ex->>'numero')::bigint, 40); raise exception 'ECHEC gloire apres mort';
  exception when raise_exception then if sqlerrm <> 'deja_fini' then raise; end if; raise notice 'OK recycle'; end;

  -- Cadence : 16 exemplaires en une minute
  begin
    for i in 1..20 loop perform public.nouvel_exemplaire(b, 'x'); end loop;
    raise exception 'ECHEC cadence';
  exception when raise_exception then if sqlerrm <> 'trop_vite' then raise; end if; raise notice 'OK cadence'; end;

  raise notice 'etat %', public.etat();
  raise notice 'vivantes %', json_array_length(public.statues_vivantes(10));
  raise notice 'galerie %', json_array_length(public.galerie());
end $$;

reset role;
-- La file de la gloire : on vieillit deux exemplaires pour simuler une vraie montée
do $$
declare a uuid := '00000000-0000-0000-0000-0000000000c1'; b uuid := '00000000-0000-0000-0000-0000000000c2';
  n1 bigint; n2 bigint; g1 json; g2 json;
begin
  n1 := (public.nouvel_exemplaire(a, 'Une')->>'numero')::bigint;
  n2 := (public.nouvel_exemplaire(b, 'Deux')->>'numero')::bigint;
  update public.exemplaires set cree_le = now() - interval '3 minutes' where numero in (n1, n2);
  g1 := public.revendiquer_gloire(a, n1, 170);
  g2 := public.revendiquer_gloire(b, n2, 175);
  if (g2->>'debut')::timestamptz <> (g1->>'fin')::timestamptz or (g2->>'attente')::int <> 1 then
    raise exception 'ECHEC file % %', g1, g2;
  end if;
  if (public.etat()->'celebre'->>'pseudo') <> 'Une' or (public.etat()->>'file')::int <> 1 then raise exception 'ECHEC etat %', public.etat(); end if;
  raise notice 'OK file de la gloire : % puis %', g1->>'fin', g2->>'fin';
end $$;
