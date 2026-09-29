import type { TaskType } from './sources/types';
import { IST_OFFSET } from './time';

export type ExtractedDeadline = { course: string; title: string; key: string; type: TaskType; dueAt: Date; url: string | null };
export type EmailForExtraction = { from: string; subject: string; sentAt: Date; body: string };

/** Gemini couldn't be used right now (rate limit, bad key, unknown model): try the email again later. */
export class GeminiUnavailable extends Error {}

const SYSTEM = `You read emails that an online course platform (NPTEL or the IIT Madras BS degree) sent to a student, and list the deadlines the student has to act on.

Include: assignment and quiz submission deadlines, and exam registration or fee payment deadlines.
Leave out: exam dates themselves, results, certificates, webinars, live sessions, and anything that isn't a deadline for the student.

For each deadline:
- course: the course name as the email writes it, without course codes.
- title: short, like "Week 3 Assignment", "Quiz 1" or "Exam registration".
- key: an identifier that any other email about the same deadline would also produce: lowercase words joined by hyphens, like "week-3-assignment" or "exam-registration".
- type: "assignment", "quiz", or "other" (registration and fees are "other").
- due_ist: the deadline in India time as YYYY-MM-DDTHH:MM. If only a date is given, use 23:59. Resolve relative dates ("this Sunday") from the email's sent date. If the year is missing, pick the one that puts the date nearest after the sent date.
- url: a link to the assignment, quiz or course page if the email has one, otherwise null.

If the email extends or changes a deadline, return only the new one. If the email has no deadlines, return an empty list.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    deadlines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          course: { type: 'STRING' },
          title: { type: 'STRING' },
          key: { type: 'STRING' },
          type: { type: 'STRING', enum: ['assignment', 'quiz', 'other'] },
          due_ist: { type: 'STRING' },
          url: { type: 'STRING', nullable: true },
        },
        required: ['course', 'title', 'key', 'type', 'due_ist'],
      },
    },
  },
  required: ['deadlines'],
};

/** "2026-10-08T23:59" in IST → the UTC instant. */
function fromIST(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, h === 23 && mi === 59 ? 59 : 0) - IST_OFFSET);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Asks Gemini for the deadlines in one email. The model's JSON is checked, never trusted blindly. */
export async function extractDeadlines(email: EmailForExtraction): Promise<ExtractedDeadline[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiUnavailable('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const prompt = `Sent: ${email.sentAt.toISOString()} (UTC)\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body.slice(0, 12_000)}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });
  if (!res.ok) {
    const detail = res.status === 429 ? 'rate limit, will retry' : (await res.text()).slice(0, 200);
    throw new GeminiUnavailable(`Gemini returned HTTP ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let parsed: { deadlines?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini did not return JSON');
  }

  const out: ExtractedDeadline[] = [];
  for (const d of parsed.deadlines ?? []) {
    const dueAt = typeof d.due_ist === 'string' ? fromIST(d.due_ist) : null;
    const course = typeof d.course === 'string' ? d.course.trim() : '';
    const title = typeof d.title === 'string' ? d.title.trim() : '';
    const key = typeof d.key === 'string' ? d.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    if (!dueAt || !course || !title || !key) continue;
    const type: TaskType = d.type === 'assignment' || d.type === 'quiz' ? d.type : 'other';
    const url = typeof d.url === 'string' && /^https?:\/\//.test(d.url) ? d.url : null;
    out.push({ course, title, key, type, dueAt, url });
  }
  return out;
}
