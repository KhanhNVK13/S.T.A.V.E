const MAILPIT = "http://127.0.0.1:54324";

export interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MAILPIT}${path}`, init);
  if (!res.ok) throw new Error(`Mailpit ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function mailsTo(address: string): Promise<MailSummary[]> {
  const body = await json<{ messages: MailSummary[] }>(
    `/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  return [...body.messages].sort((a, b) => a.Created.localeCompare(b.Created));
}

export async function waitForMails(
  address: string,
  count: number,
  timeoutMs = 30_000,
): Promise<MailSummary[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mails = await mailsTo(address);
    if (mails.length >= count) return mails;
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} mail(s) for ${address}, found ${mails.length}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function mailText(id: string): Promise<string> {
  const body = await json<{ Text: string; HTML: string }>(
    `/api/v1/message/${id}`,
  );
  return `${body.Text}\n${body.HTML}`;
}

export async function verificationLink(id: string): Promise<string> {
  const text = await mailText(id);
  const match = text.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/);
  if (!match) throw new Error("No verification link found in the mail");
  return match[0].replace(/&amp;/g, "&");
}

export async function mailCountFor(address: string): Promise<number> {
  return (await mailsTo(address)).length;
}
