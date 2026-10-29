-- 002 — Un monde par version du niveau.
-- Quand le niveau change (nouvelles corniches, obstacles), les corps posés dans
-- l'ancien flotteraient dans le vide du nouveau. Chaque corps garde donc le
-- numéro du niveau où il a été imprimé, et chaque version du jeu ne voit que
-- les siens. Les anciennes appli (1.4, 1.5) appellent imprimer / statues_vivantes :
-- elles restent dans le monde du niveau 1. Rien n'est supprimé.

alter table public.statues add column if not exists niveau smallint not null default 1;
create index if not exists statues_niveau on public.statues (niveau, expire_le);

-- Anciennes fonctions : limitées au niveau 1 (même signature, corps remplacé)
create or replace function public.statues_vivantes(p_limite int default 900)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(public._statue_json(st)), '[]'::json)
  from (select * from public.statues where expire_le > now() and niveau = 1
        order by achats desc, y desc, cree_le desc
        limit least(greatest(coalesce(p_limite, 900), 1), 1500)) st
$$;

-- Imprimer dans une version donnée du niveau (mêmes vérifications que imprimer)
create or replace function public.imprimer_dans(
  p_niveau int, p_appareil uuid, p_numero bigint, p_s real, p_y real, p_pose int, p_face int,
  p_mot text, p_heure int, p_minute int, p_batterie int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  st json;
begin
  if p_niveau is null or p_niveau < 1 or p_niveau > 100 then raise exception 'niveau_inconnu' using errcode = 'P0001'; end if;
  st := public.imprimer(p_appareil, p_numero, p_s, p_y, p_pose, p_face, p_mot, p_heure, p_minute, p_batterie);
  update public.statues set niveau = p_niveau where id = (st->>'id')::bigint;
  return st;
end $$;

create or replace function public.statues_du_niveau(p_niveau int, p_limite int default 900)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(public._statue_json(st)), '[]'::json)
  from (select * from public.statues where expire_le > now() and niveau = p_niveau
        order by achats desc, y desc, cree_le desc
        limit least(greatest(coalesce(p_limite, 900), 1), 1500)) st
$$;

revoke all on function public.imprimer_dans(int, uuid, bigint, real, real, int, int, text, int, int, int),
  public.statues_du_niveau(int, int) from public;
grant execute on function public.imprimer_dans(int, uuid, bigint, real, real, int, int, text, int, int, int),
  public.statues_du_niveau(int, int) to anon, authenticated;
