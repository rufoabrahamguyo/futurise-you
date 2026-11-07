import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { meKey, useMe } from "@/features/auth/hooks";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

interface AINoticeApi {
  /** Runs `action` once the user has acknowledged the AI notice (asking first if needed). */
  withNotice: (action: () => void) => void;
}

const Ctx = createContext<AINoticeApi | null>(null);

export function AINoticeContent() {
  return (
    <div className="text-ink-700 space-y-3 text-sm">
      <p>
        KaziTrail uses an AI provider to read your saved material and suggest structured details or
        practice questions.
      </p>
      <div>
        <p className="text-ink-900 font-medium">What is sent</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>For extraction: the job description text you saved.</li>
          <li>
            For interview preparation: the job description, the requirements you approved, and the
            text of the CV and cover letter you submitted, with email addresses and phone numbers
            removed first.
          </li>
        </ul>
      </div>
      <div>
        <p className="text-ink-900 font-medium">What is not sent</p>
        <p className="mt-1">
          Your name, email, other applications, notes or files you didn&apos;t submit. Original
          files are never sent; only extracted text.
        </p>
      </div>
      <p>
        Your data is saved before any AI call. If the AI fails, nothing is lost and you can always
        enter details yourself. AI results are suggestions: you review them before they change your
        record.
      </p>
    </div>
  );
}

export function AINoticeProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const ack = useMutation({
    mutationFn: () => api.post<User>("/auth/ai-acknowledgement"),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });

  const withNotice = useCallback(
    (action: () => void) => {
      if (me.data?.ai_acknowledged_at) {
        action();
        return;
      }
      pending.current = action;
      setOpen(true);
    },
    [me.data?.ai_acknowledged_at],
  );
  const value = useMemo(() => ({ withNotice }), [withNotice]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Before you use AI"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Not now</Button>
            <Button
              variant="primary"
              loading={ack.isPending}
              onClick={() =>
                ack.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    pending.current?.();
                    pending.current = null;
                  },
                  onError: (e) => toast.show(errorMessage(e), "error"),
                })
              }
            >
              I understand, continue
            </Button>
          </>
        }
      >
        <AINoticeContent />
      </Dialog>
    </Ctx.Provider>
  );
}

export function useAINotice(): AINoticeApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAINotice must be used inside AINoticeProvider");
  return ctx;
}

const AI_ERRORS: Record<string, string> = {
  provider_unavailable: "The AI service didn't respond.",
  invalid_output: "The AI returned something we couldn't use, even after a retry.",
  unexpected_error: "Something went wrong while processing.",
};

export function aiErrorMessage(code: string): string {
  return AI_ERRORS[code] ?? "The AI request failed.";
}
