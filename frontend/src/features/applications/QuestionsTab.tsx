import { useState } from "react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/Feedback";
import { Field, Input, Textarea } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import type { Application, Question } from "@/lib/types";

import { useQuestionMutations, useQuestions } from "./timeline";

/** The questions the application form asked and the answers the user submitted. */
export function QuestionsTab({ app }: { app: Application }) {
  const questions = useQuestions(app.id);
  const { create } = useQuestionMutations(app.id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  if (questions.isPending) return <SkeletonRows rows={3} label="Loading questions" />;
  if (questions.isError)
    return (
      <ErrorState
        message={errorMessage(questions.error)}
        onRetry={() => void questions.refetch()}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-500 text-sm">
          Keep the exact answers you gave, so you can stay consistent in interviews.
        </p>
        <Button icon="plus" onClick={() => setAdding(true)} disabled={adding}>
          Add question
        </Button>
      </div>
      {adding ? (
        <QuestionForm
          submitLabel="Save question"
          saving={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: () => {
                setAdding(false);
                toast.show("Question saved.");
              },
              onError: (e) => toast.show(errorMessage(e), "error"),
            })
          }
        />
      ) : null}
      {questions.data.length === 0 && !adding ? (
        <div className="card">
          <EmptyState icon="question" title="No questions recorded" compact>
            Add the questions from the application form, like “Why do you want to work here?”, with
            the answer you submitted.
          </EmptyState>
        </div>
      ) : (
        <ol className="space-y-3">
          {questions.data.map((q, index) => (
            <QuestionItem
              key={q.id}
              app={app}
              question={q}
              index={index}
              total={questions.data.length}
              previous={questions.data[index - 1]}
              next={questions.data[index + 1]}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function QuestionItem({
  app,
  question,
  index,
  total,
  previous,
  next,
}: {
  app: Application;
  question: Question;
  index: number;
  total: number;
  previous?: Question;
  next?: Question;
}) {
  const { update, remove } = useQuestionMutations(app.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  function swap(other: Question | undefined) {
    if (!other) return;
    update.mutate({ id: question.id, order: other.order });
    update.mutate({ id: other.id, order: question.order });
  }

  if (editing) {
    return (
      <li>
        <QuestionForm
          initial={question}
          submitLabel="Save changes"
          saving={update.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(input) =>
            update.mutate(
              { id: question.id, ...input },
              {
                onSuccess: () => setEditing(false),
                onError: (e) => toast.show(errorMessage(e), "error"),
              },
            )
          }
        />
      </li>
    );
  }
  return (
    <li className="card p-5">
      <div className="flex items-start gap-3">
        <span className="text-pine-700 mt-0.5 text-sm font-semibold">Q{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink-900 font-medium whitespace-pre-wrap">{question.question}</p>
          {question.answer ? (
            <p className="text-ink-700 mt-2 text-sm leading-relaxed whitespace-pre-wrap">
              {question.answer}
            </p>
          ) : (
            <p className="text-ink-400 mt-2 text-sm italic">No answer recorded</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={index === 0}
          onClick={() => swap(previous)}
          aria-label={`Move question ${index + 1} up`}
        >
          Up
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={index === total - 1}
          onClick={() => swap(next)}
          aria-label={`Move question ${index + 1} down`}
        >
          Down
        </Button>
        <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Delete this question?"
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          remove.mutate(question.id, {
            onSuccess: () => setConfirm(false),
            onError: (e) => toast.show(errorMessage(e), "error"),
          })
        }
      >
        The question and your recorded answer will be removed.
      </ConfirmDialog>
    </li>
  );
}

function QuestionForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial?: Question;
  submitLabel: string;
  saving: boolean;
  onSubmit: (input: { question: string; answer: string }) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [error, setError] = useState<string>();
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!question.trim()) return setError("Enter the question.");
        onSubmit({ question: question.trim(), answer });
      }}
    >
      <Field label="Question" error={error}>
        {(a) => (
          <Input
            {...a}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            data-autofocus
          />
        )}
      </Field>
      <Field label="Your submitted answer" optional>
        {(a) => (
          <Textarea {...a} rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
