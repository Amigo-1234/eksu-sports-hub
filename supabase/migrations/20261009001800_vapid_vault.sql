-- Web Push VAPID key pair in Supabase Vault.
--
-- The pair is generated server-side once (a temporary dispatcher-secret
-- route, removed after production was initialised) and written here in one call, so the public and private halves can never
-- come from different generations. Only service_role can reach these
-- functions; browsers get the public half through
-- GET /api/notifications/vapid-key, never the private one.

-- Public half only (for the browser endpoint; never loads the private key).
create or replace function public.service_vapid_public_key()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v using 'notifications_vapid_public_key';
  return v;
end $$;

-- Both halves, for the dispatcher (signing) only.
create or replace function public.service_vapid_keys()
returns table (public_key text, private_key text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  return query execute
    'select (select decrypted_secret from vault.decrypted_secrets where name = $1),
            (select decrypted_secret from vault.decrypted_secrets where name = $2)'
    using 'notifications_vapid_public_key', 'notifications_vapid_private_key';
end $$;

-- One-time initialisation: stores a freshly generated pair. Refuses to
-- overwrite an existing key (rotation would orphan every subscription and is
-- a deliberate manual operation). Returns status only, never key material.
create or replace function public.service_vapid_init(p_public text, p_private text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing int;
begin
  if p_public is null or p_public !~ '^[A-Za-z0-9_-]{87}$'
     or p_private is null or p_private !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid VAPID key shape' using errcode = 'EK422';
  end if;
  if to_regclass('vault.secrets') is null then
    raise exception 'Vault is not available' using errcode = 'EK503';
  end if;
  perform pg_advisory_xact_lock(hashtext('notifications_vapid_init'));
  execute 'select count(*) from vault.secrets where name in ($1, $2)'
    into v_existing using 'notifications_vapid_public_key', 'notifications_vapid_private_key';
  if v_existing > 0 then
    return jsonb_build_object('created', false, 'reason', 'exists');
  end if;
  execute 'select vault.create_secret($1, $2, $3)'
    using p_public, 'notifications_vapid_public_key', 'Web Push VAPID public key (generated server-side)';
  execute 'select vault.create_secret($1, $2, $3)'
    using p_private, 'notifications_vapid_private_key', 'Web Push VAPID private key (generated server-side; server-only)';
  return jsonb_build_object('created', true);
end $$;

revoke execute on function
  public.service_vapid_public_key(),
  public.service_vapid_keys(),
  public.service_vapid_init(text, text)
from public, anon, authenticated;

grant execute on function
  public.service_vapid_public_key(),
  public.service_vapid_keys(),
  public.service_vapid_init(text, text)
to service_role;
