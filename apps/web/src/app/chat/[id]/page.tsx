import { notFound } from "next/navigation";
import { getConversation, listConversations, getAvailableModels } from "../actions";
import ChatLayout from "../_components/chat-layout";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [data, conversations, models] = await Promise.all([
    getConversation(id),
    listConversations(50),
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
    />
  );
}
