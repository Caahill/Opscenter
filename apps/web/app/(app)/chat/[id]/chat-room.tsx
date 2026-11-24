'use client';
// One channel: history, live messages and the composer. Mentions are typed as @name or #record and
// sent as tokens; the API re-labels every token for each reader (PRD 5.2).
import { mentionToken, MENTION_TOKEN, type ChatHistoryView, type ChatMessageView, type MentionOptionView } from '@opshub/shared';
import { Button, Textarea } from '@opshub/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getJson, send } from '@/lib/client';
import { formatDateTime } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';

/** Group events are stored as "_text_" (see chat.service announce). */
const isEvent = (body: string) => /^_[^_\n]+_$/.test(body);

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const dayKey = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
const timeOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));

/** "Today", "Yesterday" or "Mon 23 Nov 2026", for the line between days. */
function dayLabel(iso: string, timeZone: string): string {
  const key = dayKey(iso, timeZone);
  const today = dayKey(new Date().toISOString(), timeZone);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), timeZone);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

/** Message text with its mention tokens as links (or "no access" where the reader has none). */
export function MessageBody({ m, mine = false }: { m: ChatMessageView; mine?: boolean }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of m.body.matchAll(new RegExp(MENTION_TOKEN.source, 'g'))) {
    const [token, sigil, label, type, id] = match as unknown as [string, string, string, string, string];
    parts.push(m.body.slice(at, match.index));
    const mention = m.mentions.find((x) => x.type === type && x.id === id);
    if (!mention?.label) {
      parts.push(
        <span key={match.index} className={`rounded px-1 ${mine ? 'bg-white/15 text-on-primary/80' : 'bg-canvas text-muted'}`} title="You cannot open this record">
          {sigil}no access
        </span>,
      );
    } else if (mention.href) {
      parts.push(
        <Link key={match.index} href={mention.href} className={`font-semibold underline-offset-2 hover:underline ${mine ? 'text-on-primary underline' : 'text-link'}`}>
          {sigil}
          {label}
        </Link>,
      );
    } else {
      parts.push(
        <span key={match.index} className="font-semibold">
          {sigil}
          {label}
        </span>,
      );
    }
    at = match.index + token.length;
  }
  parts.push(m.body.slice(at));
  return <p className="whitespace-pre-wrap break-words text-[15px]">{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</p>;
}

/** The @word or #word being typed at the cursor, if any. */
function typing(text: string, cursor: number): { sigil: '@' | '#'; query: string; start: number } | null {
  const m = /(^|\s)([@#])([^\s@#]{1,40})$/.exec(text.slice(0, cursor));
  return m ? { sigil: m[2] as '@' | '#', query: m[3]!, start: cursor - m[3]!.length - 1 } : null;
}

export function ChatRoom({ initial, meId, timezone }: { initial: ChatHistoryView; meId: string; timezone: string }) {
  const router = useRouter();
  const channelId = initial.channel.id;
  const [messages, setMessages] = useState(initial.messages);
  const [nextBefore, setNextBefore] = useState(initial.nextBefore);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Array<{ shown: string; token: string }>>([]);
  const [options, setOptions] = useState<MentionOptionView[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const markRead = () => send('POST', `/chat/channels/${channelId}/read`).then(() => router.refresh(), () => null);
  useEffect(() => {
    void markRead();
    end.current?.scrollIntoView({ block: 'end' });
  }, [channelId]);

  useRealtime('chat.message_new', (payload) => {
    const m = payload as ChatMessageView;
    if (m.channelId !== channelId) return;
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    if (m.authorId !== meId && document.visibilityState === 'visible') void markRead();
    setTimeout(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 50);
  });

  const current = () => typing(text, box.current?.selectionStart ?? text.length);
  useEffect(() => {
    const t = current();
    if (!t) return setOptions([]);
    const handle = setTimeout(async () => {
      const list = await getJson<MentionOptionView[]>(`/chat/mention-options?q=${encodeURIComponent(t.query)}`).catch(() => []);
      setOptions(t.sigil === '@' ? list.filter((o) => o.type === 'user') : list.filter((o) => o.type !== 'user'));
      setActive(0);
    }, 150);
    return () => clearTimeout(handle);
  }, [text]);

  function choose(o: MentionOptionView) {
    const t = current();
    if (!t) return;
    const shown = `${o.type === 'user' ? '@' : '#'}${o.label}`;
    const next = `${text.slice(0, t.start)}${shown} ${text.slice(box.current?.selectionStart ?? text.length)}`;
    setText(next);
    setPicked((p) => [...p, { shown, token: mentionToken(o.type, o.id, o.label) }]);
    setOptions([]);
    box.current?.focus();
  }

  async function submit() {
    let body = text.trim();
    if (!body) return;
    for (const p of picked) body = body.replace(p.shown, p.token);
    // Clear the box straight away, so the next message can be typed while this one is sending.
    const draft = { text, picked };
    setText('');
    setPicked([]);
    setBusy(true);
    setError(null);
    try {
      const m = await send<ChatMessageView>('POST', `/chat/channels/${channelId}/messages`, { body });
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setTimeout(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 50);
    } catch (e) {
      // Not sent: put the text back (unless something new was typed meanwhile) and say why.
      setText((now) => (now ? now : draft.text));
      setPicked((now) => (now.length ? now : draft.picked));
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(options[active]!);
        return;
      }
      if (e.key === 'Escape') return setOptions([]);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  async function earlier() {
    if (!nextBefore) return;
    const page = await getJson<ChatHistoryView>(`/chat/channels/${channelId}/messages?before=${encodeURIComponent(nextBefore)}`);
    setMessages((list) => [...page.messages, ...list]);
    setNextBefore(page.nextBefore);
  }

  return (
    <div className="rounded-lg border border-border bg-canvas">
      <div className="max-h-[60vh] min-h-[240px] overflow-y-auto px-4 py-4" data-testid="chat-messages">
        {nextBefore ? (
          <Button variant="link" size="inline" className="mb-4" type="button" onClick={earlier}>
            Load earlier messages
          </Button>
        ) : null}
        {messages.length === 0 ? <p className="py-8 text-center text-muted">No messages yet. Say hello.</p> : null}
        <ul className="flex flex-col gap-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const day = dayKey(m.createdAt, timezone);
            const newDay = !prev || dayKey(prev.createdAt, timezone) !== day;
            const separator = newDay ? (
              <li key={`day-${m.id}`} aria-hidden className="my-3 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(m.createdAt, timezone)}
                <span className="h-px flex-1 bg-border" />
              </li>
            ) : null;

            if (isEvent(m.body)) {
              // Group events ("created the group", "added Sana") read as a quiet line, not a bubble.
              return (
                <Fragment key={m.id}>
                  {separator}
                  <li data-testid="chat-message" className="my-2 text-center text-xs text-muted">
                    <span className="rounded-full bg-surface-alt px-3 py-1">
                      {m.authorId === meId ? 'You' : (m.authorName ?? 'Someone')} {m.body.slice(1, -1)} · {timeOf(m.createdAt, timezone)}
                    </span>
                  </li>
                </Fragment>
              );
            }

            const mine = m.authorId === meId;
            // Consecutive messages from one person within 5 minutes form one run: name and avatar once.
            const startsRun = newDay || !prev || isEvent(prev.body) || prev.authorId !== m.authorId || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 5 * 60_000;
            const name = m.authorName ?? 'Someone';
            return (
              <Fragment key={m.id}>
                {separator}
                <li data-testid="chat-message" data-mine={mine ? 'true' : undefined} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${startsRun ? 'mt-3' : ''}`}>
                  {!mine ? (
                    <span
                      aria-hidden
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold ${startsRun ? '' : 'invisible'}`}
                    >
                      {initialsOf(name)}
                    </span>
                  ) : null}
                  <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {startsRun && !mine ? <span className="mb-1 px-1 text-xs font-medium text-muted">{name}</span> : null}
                    <div
                      className={`rounded-2xl px-3.5 py-2 shadow-card ${
                        mine ? 'rounded-br-md bg-primary text-on-primary' : 'rounded-bl-md border border-border bg-surface-alt text-body'
                      }`}
                    >
                      <span className="sr-only">{mine ? 'You' : name}: </span>
                      <MessageBody m={m} mine={mine} />
                      <span className={`mt-0.5 block text-right text-[10.5px] ${mine ? 'text-on-primary/60' : 'text-muted'}`} title={formatDateTime(m.createdAt, timezone)}>
                        {timeOf(m.createdAt, timezone)}
                      </span>
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
        <div ref={end} />
      </div>
      <div className="relative border-t border-border p-3">
        {options.length ? (
          <ul role="listbox" aria-label="Mention suggestions" className="absolute bottom-full left-3 mb-1 w-[min(360px,calc(100%-24px))] overflow-hidden rounded-lg border border-border bg-canvas shadow-lg">
            {options.map((o, i) => (
              <li key={`${o.type}:${o.id}`} role="option" aria-selected={i === active}>
                <Button
                  type="button"
                  variant="ghost"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={`h-auto w-full justify-between gap-3 rounded-none px-3 py-2 text-left font-normal ${i === active ? 'bg-surface-alt' : ''}`}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="text-xs text-muted">{o.hint ?? 'Person'}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <Textarea
          id="chat-input"
          ref={box}
          rows={2}
          placeholder="Write a message. Type @ for a person, # for a task, project or client."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey} />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted">Client emails, numbers and logins are hidden when you send.</p>
          <Button onClick={submit} disabled={busy || !text.trim()}>
            Send
          </Button>
        </div>
        {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
      </div>
    </div>
  );
}
