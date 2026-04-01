-- Migration: knowledge_platform
-- Applied via Supabase MCP on 2026-04-01

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Utility: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── TENANT LAYER ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  avatar_url  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_member_of_org(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_org_id AND user_id = auth.uid()
  );
$$;

-- ─── KNOWLEDGE LAYER ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  source_type       TEXT NOT NULL DEFAULT 'text',
  storage_path      TEXT,
  original_filename TEXT,
  mime_type         TEXT,
  raw_text          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  word_count        INTEGER,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  chunk_text      TEXT NOT NULL,
  token_count     INTEGER,
  char_start      INTEGER,
  char_end        INTEGER,
  embedding       VECTOR(1536),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, chunk_index)
);

-- ─── OPERATIVE LAYER ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  website         TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  role_title      TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  description     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.source_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id       UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  linked_type     TEXT NOT NULL,
  linked_id       UUID NOT NULL,
  link_role       TEXT NOT NULL DEFAULT 'reference',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, linked_type, linked_id)
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sources_org ON public.sources (organization_id, source_type, status);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON public.content_chunks (source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_companies_org ON public.companies (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts (organization_id, last_name);
CREATE INDEX IF NOT EXISTS idx_projects_org ON public.projects (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_sources_fts ON public.sources USING GIN(
  to_tsvector('german', COALESCE(title,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(raw_text,''))
);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.content_chunks USING GIN(
  to_tsvector('german', chunk_text)
);

-- ─── TRIGGERS ─────────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_members BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_sources BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_companies BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_contacts BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- ─── FTS SEARCH FUNCTION ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_chunks(
  p_org_id UUID,
  p_query  TEXT,
  p_limit  INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title, s.source_type,
         ts_rank(to_tsvector('german', c.chunk_text), websearch_to_tsquery('german', p_query)) AS rank
  FROM public.content_chunks c
  JOIN public.sources s ON s.id = c.source_id
  WHERE c.organization_id = p_org_id
    AND to_tsvector('german', c.chunk_text) @@ websearch_to_tsquery('german', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_member_read" ON public.organizations FOR SELECT USING (public.is_member_of_org(id));
CREATE POLICY "profiles_self" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "members_org_read" ON public.organization_members FOR SELECT USING (public.is_member_of_org(organization_id));
CREATE POLICY "sources_org_all" ON public.sources FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));
CREATE POLICY "chunks_org_all" ON public.content_chunks FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));
CREATE POLICY "companies_org_all" ON public.companies FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));
CREATE POLICY "contacts_org_all" ON public.contacts FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));
CREATE POLICY "projects_org_all" ON public.projects FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));
CREATE POLICY "source_links_org_all" ON public.source_links FOR ALL USING (public.is_member_of_org(organization_id)) WITH CHECK (public.is_member_of_org(organization_id));

-- Seed: default organization
INSERT INTO public.organizations (id, slug, name, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'time-keeper', 'Time Keeper', 'active')
ON CONFLICT (slug) DO NOTHING;
