"use client";

import { ArrowRight, Bot, Lightbulb, LoaderCircle, RotateCcw, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { askAssistant } from "./actions";
import { QUESTIONS, QUESTION_LABEL, type AssistantAnswer, type QuestionId } from "./questions";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: AssistantAnswer };

/** Chat with the assistant: suggested questions, a message list and an input. */
export function AssistantChat() {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message (or the "thinking" line) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  function ask(text: string, id?: QuestionId) {
    const question = text.trim();
    if (!question || pending) return;
    setMessages((list) => [...list, { id: nextId.current++, role: "user", text: question }]);
    setDraft("");
    startTransition(async () => {
      let answer: AssistantAnswer;
      try {
        answer = await askAssistant(id ? { id } : { question });
      } catch {
        answer = { text: t("assistant.error") };
      }
      setMessages((list) => [...list, { id: nextId.current++, role: "assistant", answer }]);
      inputRef.current?.focus();
    });
  }

  const suggestions = (
    <div className="grid gap-2 sm:grid-cols-2">
      {QUESTIONS.map((id) => (
        <button
          key={id}
          type="button"
          disabled={pending}
          onClick={() => ask(t(QUESTION_LABEL[id]), id)}
          className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          {t(QUESTION_LABEL[id])}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{t("assistant.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("assistant.subtitle")}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setMessages([])}>
            <RotateCcw />
            {t("assistant.newChat")}
          </Button>
        )}
      </div>

      <Card className="flex h-[calc(100dvh-11rem)] min-h-[32rem] flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-info/15 text-info">
                <Bot className="size-8" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">{t("assistant.greeting")}</h2>
              <p className="mt-2 max-w-md text-muted-foreground">{t("assistant.intro")}</p>
              <p className="mt-8 mb-3 flex items-center gap-1.5 text-sm font-medium">
                <Lightbulb className="size-4 text-warning" />
                {t("assistant.suggested")}
              </p>
              <div className="w-full">{suggestions}</div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                      {message.text}
                    </p>
                  </div>
                ) : (
                  <AssistantMessage key={message.id} answer={message.answer}>
                    {message.answer.suggest && <div className="mt-3">{suggestions}</div>}
                  </AssistantMessage>
                ),
              )}
              {pending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <BotAvatar />
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("assistant.thinking")}
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-3 border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder={t("assistant.placeholder")}
            aria-label={t("assistant.placeholder")}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-muted/60 px-4 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11"
            disabled={pending || draft.trim() === ""}
            aria-label={t("assistant.send")}
          >
            <SendHorizontal />
          </Button>
        </form>
      </Card>
    </>
  );
}

function BotAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
      <Bot className="size-4" />
    </div>
  );
}

function AssistantMessage({
  answer,
  children,
}: {
  answer: AssistantAnswer;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <BotAvatar />
      <div className="min-w-0 max-w-[85%] flex-1 rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{answer.text}</p>
        {answer.rows && answer.rows.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {answer.rows.map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.label}</p>
                  {row.hint && <p className="truncate text-xs text-muted-foreground">{row.hint}</p>}
                </div>
                <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
              </li>
            ))}
          </ul>
        )}
        {children}
        {(answer.link || answer.note) && (
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1",
              answer.link ? "justify-between" : "justify-end",
            )}
          >
            {answer.link && (
              <Link
                href={answer.link.href}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {answer.link.label}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
            {answer.note && <span className="text-xs text-muted-foreground">{answer.note}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
