import { requirePharmacy } from "@/lib/auth";
import { pageTitle } from "@/lib/metadata";
import { AssistantChat } from "./assistant-chat";

export const generateMetadata = pageTitle("nav.aiAssistant");

export default async function AssistantPage() {
  await requirePharmacy();
  return <AssistantChat />;
}
