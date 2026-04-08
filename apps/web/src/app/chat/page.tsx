import { redirect } from "next/navigation";
import { listConversations, createConversation } from "./actions";

// Entry point: jump to most recent conversation, or create a new one.
export default async function ChatIndexPage() {
  const conversations = await listConversations(1);
  if (conversations.length > 0) {
    redirect(`/chat/${conversations[0].id}`);
  }
  const id = await createConversation();
  redirect(`/chat/${id}`);
}
