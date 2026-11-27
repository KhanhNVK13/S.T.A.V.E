import { apiFetch } from "./api-client";

export interface AskProjectResult {
  answer: string | null;
  toolsUsed: string[];
  rateLimited: boolean;
}

export async function askProjectHistory(
  projectId: string,
  question: string,
  lang?: "en" | "vi",
): Promise<AskProjectResult> {
  return apiFetch<AskProjectResult>("/ai/ask-project", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      question,
      ...(lang ? { lang } : {}),
    }),
  });
}
