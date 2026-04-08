-- Migration: chat_conversations_and_messages
-- Persistente Chat-History (ChatGPT-Stil) mit RLS pro Org.
-- Conversations gruppieren chat_messages; jede Message hält ihre Quellen
-- als jsonb fuer spaetere Anzeige + Auditierbarkeit.

create table if not exists public.chat_conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid references auth.users(id) on delete set null,
  title            text not null default 'Neuer Chat',
  model            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  archived_at      timestamptz
);

create index if not exists chat_conversations_org_updated_idx
  on public.chat_conversations (organization_id, last_message_at desc)
  where archived_at is null;

create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             text not null check (role in ('user','assistant','system')),
  content          text not null,
  sources          jsonb not null default '[]'::jsonb,
  model            text,
  entity_context   text,
  rewritten_query  text,
  token_usage      jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

create or replace function public.touch_chat_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.chat_conversations
     set last_message_at = now(),
         updated_at      = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_touch on public.chat_messages;
create trigger chat_messages_touch
after insert on public.chat_messages
for each row execute function public.touch_chat_conversation();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

drop policy if exists "chat_conversations_org_all" on public.chat_conversations;
create policy "chat_conversations_org_all"
  on public.chat_conversations for all
  using      (public.is_member_of_org(organization_id))
  with check (public.is_member_of_org(organization_id));

drop policy if exists "chat_messages_org_all" on public.chat_messages;
create policy "chat_messages_org_all"
  on public.chat_messages for all
  using      (public.is_member_of_org(organization_id))
  with check (public.is_member_of_org(organization_id));
