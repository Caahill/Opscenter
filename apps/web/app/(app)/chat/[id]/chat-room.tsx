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

/** Message text with its mention tokens as links (or "no access" where the reader has none). */
export function MessageBody({ m }: { m: ChatMessageView }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of m.body.matchAll(new RegExp(MENTION_TOKEN.source, 'g'))) {
    const [token, sigil, label, type, id] = match as unknown as [string, string, string, string, string];
    parts.push(m.body.slice(at, match.index));
    const mention = m.mentions.find((x) => x.type === type && x.id === id);
    if (!mention?.label) {
      parts.push(
        <span key={match.index} className="rounded bg-surface-alt px-1 text-muted" title="You cannot open this record">
          {sigil}no access
        </span>,
      );
    } else if (mention.href) {
      parts.push(
        <Link key={match.index} href={mention.href} className="font-semibold text-link">
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
    setBusy(true);
    setError(null);
    try {
      const m = await send<ChatMessageView>('POST', `/chat/channels/${channelId}/messages`, { body });
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setText('');
      setPicked([]);
      setTimeout(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 50);
    } catch (e) {
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
        <ul className="space-y-4">
          {messages.map((m) =>
            /^_[^_\n]+_$/.test(m.body) ? (
              // Group events ("created the group", "added Sana") read as a quiet line, not a message.
              <li key={m.id} data-testid="chat-message" className="text-center text-xs text-muted">
                {m.authorId === meId ? 'You' : (m.authorName ?? 'Someone')} {m.body.slice(1, -1)} · {formatDateTime(m.createdAt, timezone)}
              </li>
            ) : (
            <li key={m.id} data-testid="chat-message">
              <p className="text-[13px]">
                <span className="font-semibold">{m.authorId === meId ? 'You' : (m.authorName ?? 'Someone')}</span>
                <span className="ml-2 font-mono text-[12px] text-muted">{formatDateTime(m.createdAt, timezone)}</span>
              </p>
              <MessageBody m={m} />
            </li>
            ),
          )}
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
