-- EXEMPLAIRE — le serveur (Supabase / PostgreSQL)
--
-- Les tables sont fermées au public : tout passe par les fonctions ci-dessous,
-- qui vérifient ce que le jeu envoie (bornes, vitesse de montée plausible,
-- cadence). Le jeu tourne chez le joueur, on ne peut donc pas tout prouver :
-- on refuse ce qui est physiquement impossible et on limite la cadence.

create table if not exists public.exemplaires (
  -- Les numéros 1 à 100 sont réservés aux fondateurs et aux « exemplaires défectueux »
  numero   bigint generated always as identity (start with 101) primary key,
  appareil uuid not null,
  pseudo   text not null,
  cree_le  timestamptz not null default now(),
  fin      text check (fin in ('imprime', 'recycle', 'gloire')),
  fini_le  timestamptz,
  hauteur  real
);
create index if not exists exemplaires_appareil on public.exemplaires (appareil, cree_le desc);

create table if not exists public.statues (
  id        bigint generated always as identity primary key,
  numero    bigint not null references public.exemplaires (numero),
  appareil  uuid not null,
  pseudo    text not null,
  s         real not null,
  y         real not null,
  pose      smallint not null,
  face      smallint not null,
  mot       text not null,
  heure     smallint not null,
  minute    smallint not null,
  batterie  smallint,
  cree_le   timestamptz not null default now(),
  expire_le timestamptz not null,
  signe     boolean not null default false,
  achats    integer not null default 0
);
create index if not exists statues_expire on public.statues (expire_le);
create index if not exists statues_appareil on public.statues (appareil, cree_le desc);

create table if not exists public.achats (
  statue   bigint not null references public.statues (id) on delete cascade,
  appareil uuid not null,
  cree_le  timestamptz not null default now(),
  primary key (statue, appareil)
);
create index if not exists achats_appareil on public.achats (appareil, cree_le desc);

create table if not exists public.gloire (
  id           bigint generated always as identity primary key,
  numero       bigint not null references public.exemplaires (numero),
  appareil     uuid not null,
  pseudo       text not null,
  debut        timestamptz not null,
  fin          timestamptz not null,
  duree_montee real
);
create index if not exists gloire_fin on public.gloire (fin desc);

alter table public.exemplaires enable row level security;
alter table public.statues enable row level security;
alter table public.achats enable row level security;
alter table public.gloire enable row level security;
revoke all on public.exemplaires, public.statues, public.achats, public.gloire from anon, authenticated;

-- Liste fermée des derniers mots (la même que src/constantes.js) :
-- pas de texte libre gravé sur les corps, donc rien à modérer.
create or replace function public._mots() returns text[]
language sql immutable set search_path = '' as $$
  select array['encore', 'pardon', 'maman', 'monte', 'pour toi', 'j''avais froid',
    'achetez-moi', 'rien', 'c''était beau', 'trop tôt', 'regarde', 'merci',
    'pas moi', 'presque', 'ça brûle', 'souris', 'la suite', 'je reste',
    'vendu', 'à qui le tour']
$$;

-- Pseudonyme : lettres, chiffres, espace, tiret, apostrophe ; 16 caractères au plus.
create or replace function public._pseudo(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  x text := left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[^[:alnum:] _''-]', '', 'g'), '\s+', ' ', 'g')), 16);
begin
  if x = '' or lower(x) ~ '(nazi|hitler|ss |heil|negr|nègr|bougnoul|pd$|pédé|youpin|salope|pute)' then
    return 'ANONYME';
  end if;
  return x;
end $$;

create or replace function public._statue_json(st public.statues) returns json
language sql stable set search_path = '' as $$
  select json_build_object(
    'id', st.id, 'numero', st.numero, 'pseudo', st.pseudo, 's', st.s, 'y', st.y,
    'pose', st.pose, 'face', st.face, 'mot', st.mot, 'heure', st.heure, 'minute', st.minute,
    'batterie', st.batterie, 'cree_le', st.cree_le, 'expire_le', st.expire_le, 'achats', st.achats)
$$;

-- Un nouvel exemplaire sort de la presse : on lui donne son numéro.
create or replace function public.nouvel_exemplaire(p_appareil uuid, p_pseudo text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  n bigint;
begin
  if (select count(*) from public.exemplaires
      where appareil = p_appareil and cree_le > now() - interval '1 minute') >= 15 then
    raise exception 'trop_vite' using errcode = 'P0001';
  end if;
  insert into public.exemplaires (appareil, pseudo) values (p_appareil, public._pseudo(p_pseudo))
  returning numero into n;
  return json_build_object('numero', n, 'serveur', now());
end $$;

-- Le joueur s'imprime : son corps devient une statue pour tout le monde.
create or replace function public.imprimer(
  p_appareil uuid, p_numero bigint, p_s real, p_y real, p_pose int, p_face int,
  p_mot text, p_heure int, p_minute int, p_batterie int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  ex public.exemplaires;
  st public.statues;
  ecoule real;
begin
  select * into ex from public.exemplaires where numero = p_numero for update;
  if not found or ex.appareil <> p_appareil then raise exception 'exemplaire_inconnu' using errcode = 'P0001'; end if;
  if ex.fin is not null then raise exception 'deja_fini' using errcode = 'P0001'; end if;
  ecoule := extract(epoch from now() - ex.cree_le);
  if ecoule > 3600 then raise exception 'perime' using errcode = 'P0001'; end if;
  if p_s is null or p_s < 0 or p_s > 56.6 or p_y is null or p_y < -1 or p_y > 152 then
    raise exception 'hors_limites' using errcode = 'P0001';
  end if;
  -- Personne ne monte plus vite que 4,5 m/s en moyenne (sauts de 4 m toutes les 0,6 s au mieux)
  if p_y > 8 + ecoule * 4.5 then raise exception 'trop_rapide' using errcode = 'P0001'; end if;
  if (select count(*) from public.statues
      where appareil = p_appareil and cree_le > now() - interval '15 seconds') > 0 then
    raise exception 'trop_vite' using errcode = 'P0001';
  end if;
  insert into public.statues (numero, appareil, pseudo, s, y, pose, face, mot, heure, minute, batterie, expire_le)
  values (
    p_numero, p_appareil, ex.pseudo, p_s, p_y,
    greatest(0, least(5, coalesce(p_pose, 0))),
    case when p_face < 0 then -1 else 1 end,
    case when p_mot = any (public._mots()) then p_mot else (public._mots())[1 + floor(random() * 20)::int] end,
    greatest(0, least(23, coalesce(p_heure, 0))),
    greatest(0, least(59, coalesce(p_minute, 0))),
    case when p_batterie between 0 and 100 then p_batterie end,
    now() + interval '48 hours')
  returning * into st;
  update public.exemplaires set fin = 'imprime', fini_le = now(), hauteur = p_y where numero = p_numero;
  return public._statue_json(st);
end $$;

-- Graver son dernier mot, dans les cinq minutes qui suivent la mort, une seule fois.
create or replace function public.signer(p_appareil uuid, p_id bigint, p_mot text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  st public.statues;
begin
  if not (p_mot = any (public._mots())) then raise exception 'mot_interdit' using errcode = 'P0001'; end if;
  update public.statues set mot = p_mot, signe = true
  where id = p_id and appareil = p_appareil and not signe and cree_le > now() - interval '5 minutes'
  returning * into st;
  if not found then raise exception 'trop_tard' using errcode = 'P0001'; end if;
  return public._statue_json(st);
end $$;

-- Mort dans la soupe : pas de statue, juste une ligne dans le registre.
create or replace function public.recycler(p_appareil uuid, p_numero bigint, p_hauteur real)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.exemplaires set fin = 'recycle', fini_le = now(), hauteur = greatest(-5, least(152, p_hauteur))
  where numero = p_numero and appareil = p_appareil and fin is null;
end $$;

-- Acheter le corps de quelqu'un d'autre : il reste exposé 12 h de plus (30 jours au plus).
create or replace function public.acheter(p_appareil uuid, p_id bigint)
returns json language plpgsql security definer set search_path = '' as $$
declare
  st public.statues;
begin
  select * into st from public.statues where id = p_id and expire_le > now() for update;
  if not found then raise exception 'recycle' using errcode = 'P0001'; end if;
  if st.appareil = p_appareil then raise exception 'pas_soi_meme' using errcode = 'P0001'; end if;
  if (select count(*) from public.achats where appareil = p_appareil and cree_le > now() - interval '1 minute') >= 30 then
    raise exception 'trop_vite' using errcode = 'P0001';
  end if;
  insert into public.achats (statue, appareil) values (p_id, p_appareil) on conflict do nothing;
  if not found then raise exception 'deja_achete' using errcode = 'P0001'; end if;
  update public.statues
  set achats = achats + 1, expire_le = least(expire_le + interval '12 hours', now() + interval '30 days')
  where id = p_id returning * into st;
  return public._statue_json(st);
end $$;

-- Sortir de la boîte : quinze minutes de gloire, chacun son tour.
create or replace function public.revendiquer_gloire(p_appareil uuid, p_numero bigint, p_duree real)
returns json language plpgsql security definer set search_path = '' as $$
declare
  ex public.exemplaires;
  ecoule real;
  d timestamptz;
  rang int;
begin
  select * into ex from public.exemplaires where numero = p_numero for update;
  if not found or ex.appareil <> p_appareil then raise exception 'exemplaire_inconnu' using errcode = 'P0001'; end if;
  if ex.fin is not null then raise exception 'deja_fini' using errcode = 'P0001'; end if;
  ecoule := extract(epoch from now() - ex.cree_le);
  -- 148 m à 4,5 m/s au mieux : moins de 33 s est impossible
  if ecoule < 33 then raise exception 'trop_rapide' using errcode = 'P0001'; end if;
  if (select count(*) from public.gloire where appareil = p_appareil and debut > now() - interval '10 minutes') > 0 then
    raise exception 'trop_vite' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(15);
  select greatest(now(), coalesce(max(fin), now())) into d from public.gloire;
  select count(*) into rang from public.gloire where fin > now();
  insert into public.gloire (numero, appareil, pseudo, debut, fin, duree_montee)
  values (p_numero, p_appareil, ex.pseudo, d, d + interval '15 minutes', p_duree);
  update public.exemplaires set fin = 'gloire', fini_le = now(), hauteur = 148 where numero = p_numero;
  return json_build_object('debut', d, 'fin', d + interval '15 minutes', 'attente', rang, 'serveur', now());
end $$;

-- L'état du monde, pour l'écran titre et le bandeau.
create or replace function public.etat()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'produits', coalesce((select max(numero) from public.exemplaires), 100),
    'debout', (select count(*) from public.statues where expire_le > now()),
    'sortis', (select count(*) from public.gloire),
    'recycles', (select count(*) from public.exemplaires where fin = 'recycle'),
    'celebre', (select json_build_object('pseudo', pseudo, 'numero', numero, 'fin', fin)
                from public.gloire where debut <= now() and fin > now() order by debut limit 1),
    'file', (select count(*) from public.gloire where debut > now()),
    'serveur', now())
$$;

-- Les corps encore debout. Les plus achetés et les plus hauts d'abord : ce sont
-- eux qui tiennent l'escalier.
create or replace function public.statues_vivantes(p_limite int default 900)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(public._statue_json(st)), '[]'::json)
  from (select * from public.statues where expire_le > now()
        order by achats desc, y desc, cree_le desc
        limit least(greatest(coalesce(p_limite, 900), 1), 1500)) st
$$;

-- La galerie : les douze corps qui valent le plus.
create or replace function public.galerie()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(public._statue_json(st)), '[]'::json)
  from (select * from public.statues where expire_le > now() and achats > 0
        order by achats desc, cree_le asc limit 12) st
$$;

revoke all on function public._mots(), public._pseudo(text), public._statue_json(public.statues) from public, anon, authenticated;
revoke all on function public.nouvel_exemplaire(uuid, text), public.imprimer(uuid, bigint, real, real, int, int, text, int, int, int),
  public.signer(uuid, bigint, text), public.recycler(uuid, bigint, real), public.acheter(uuid, bigint),
  public.revendiquer_gloire(uuid, bigint, real), public.etat(), public.statues_vivantes(int), public.galerie() from public;
grant execute on function public.nouvel_exemplaire(uuid, text), public.imprimer(uuid, bigint, real, real, int, int, text, int, int, int),
  public.signer(uuid, bigint, text), public.recycler(uuid, bigint, real), public.acheter(uuid, bigint),
  public.revendiquer_gloire(uuid, bigint, real), public.etat(), public.statues_vivantes(int), public.galerie() to anon, authenticated;
