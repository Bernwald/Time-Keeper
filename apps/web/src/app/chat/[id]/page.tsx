import { notFound } from "next/navigation";
import { getConversation, listConversations, listMyConversations, getAvailableModels } from "../actions";
import { isPlatformAdmin } from "@/lib/db/queries/organization";
import { getMemberRole } from "@/lib/db/org-context";
import ChatLayout from "../_components/chat-layout";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Workspace-Persona (End-User) bekommt den minimalen Chat-Look ohne Sidebar
  // — die "Letzte Chats"-Liste lebt schon auf der Home. Berater + HAIway
  // sehen weiterhin die volle Sidebar-Variante mit Audit-Sicht.
  const [admin, role] = await Promise.all([
    isPlatformAdmin().catch(() => false),
    getMemberRole().catch(() => null),
  ]);
  const isWorkspace = !admin && role !== "admin" && role !== "owner";

  const [data, conversations, models] = await Promise.all([
    getConversation(id),
    isWorkspace ? listMyConversations(50) : listConversations(50),
    getAvailableModels(),
  ]);

  if (!data) notFound();

  return (
    <ChatLayout
      activeId={id}
      conversation={data.conversation}
      messages={data.messages}
      conversations={conversations}
      models={models}
      isAdmin={admin}
      variant={isWorkspace ? "workspace" : "default"}
    />
  );
}
