-- Chats user-scopen. Bisher konnte jedes Org-Member alle Konversationen der
-- Org sehen — das ist im neuen Workspace-Konzept falsch: HAIway ist ein
-- Generierungs-Tool, kein Kollaborations-Tool. Outputs gehen zurück in die
-- Kundensysteme (Teams, Google Chat, etc.). Innerhalb von HAIway sieht jeder
-- nur seine eigenen Chats.
--
-- Berater (role IN ('admin','owner')) dürfen weiterhin alle Org-Chats sehen
-- für QA/KPI-Auswertung. End-User (role='member') sehen nur eigene.
--
-- Schreibrechte (INSERT/UPDATE/DELETE) sind eng am Owner: nur created_by =
-- auth.uid() darf editieren oder löschen. Berater können bei Bedarf später
-- über eine separate Service-Role-Action eingreifen.

-- ── chat_conversations ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "chat_conversations_org_all" ON public.chat_conversations;

CREATE POLICY "chat_conversations_select"
  ON public.chat_conversations
  FOR SELECT
  USING (
    public.is_member_of_org(organization_id)
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = chat_conversations.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('admin', 'owner')
      )
    )
  );

CREATE POLICY "chat_conversations_insert"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (
    public.is_member_of_org(organization_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

CREATE POLICY "chat_conversations_update"
  ON public.chat_conversations
  FOR UPDATE
  USING (created_by = auth.uid() AND public.is_member_of_org(organization_id))
  WITH CHECK (created_by = auth.uid() AND public.is_member_of_org(organization_id));

CREATE POLICY "chat_conversations_delete"
  ON public.chat_conversations
  FOR DELETE
  USING (created_by = auth.uid() AND public.is_member_of_org(organization_id));

-- ── chat_messages ───────────────────────────────────────────────────────
-- Sichtbarkeit erbt von der Konversation: wer die Conversation lesen darf,
-- darf auch ihre Messages lesen. Schreibrechte erbt analog.

DROP POLICY IF EXISTS "chat_messages_org_all" ON public.chat_messages;

CREATE POLICY "chat_messages_select"
  ON public.chat_messages
  FOR SELECT
  USING (
    public.is_member_of_org(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (
          c.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = c.organization_id
              AND m.user_id = auth.uid()
              AND m.role IN ('admin', 'owner')
          )
        )
    )
  );

CREATE POLICY "chat_messages_insert"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    public.is_member_of_org(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "chat_messages_update"
  ON public.chat_messages
  FOR UPDATE
  USING (
    public.is_member_of_org(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_member_of_org(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "chat_messages_delete"
  ON public.chat_messages
  FOR DELETE
  USING (
    public.is_member_of_org(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.created_by = auth.uid()
    )
  );
