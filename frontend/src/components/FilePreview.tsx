import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";
import { ErrorState } from "./Feedback";
import { Spinner } from "./Spinner";

interface Props {
  /** Returns a fresh presigned URL (links expire after five minutes). */
  getUrl: () => Promise<{ url: string; mime_type: string }>;
  title: string;
}

/** Previews a PDF (PDF.js) or image. DOCX files are download-only. */
export function FilePreview({ getUrl, title }: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; url: string; mime: string }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUrl()
      .then(
        (link) => !cancelled && setState({ status: "ready", url: link.url, mime: link.mime_type }),
      )
      .catch(
        () => !cancelled && setState({ status: "error", message: "We couldn't open this file." }),
      );
    return () => {
      cancelled = true;
    };
    // getUrl is recreated by callers each render; reload only when retrying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="text-pine-700 flex h-64 items-center justify-center">
        <Spinner label="Loading preview" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (state.mime.startsWith("image/")) {
    return (
      <img
        src={state.url}
        alt={`Preview of ${title}`}
        className="border-line mx-auto max-h-[70vh] rounded-lg border object-contain"
      />
    );
  }
  return <PdfPages url={state.url} title={title} />;
}

function PdfPages({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(3);

  useEffect(() => {
    const run = { cancelled: false };
    const isCancelled = () => run.cancelled;
    let destroy: (() => void) | undefined;
    const container = containerRef.current;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (isCancelled() || !container) return;
        setPages(pdf.numPages);
        container.replaceChildren();
        const width = Math.min(container.clientWidth || 720, 900);
        for (let n = 1; n <= Math.min(pdf.numPages, shown); n++) {
          const page = await pdf.getPage(n);
          if (isCancelled()) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.className = "rounded-md border border-line bg-white shadow-sm";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title}, page ${n} of ${pdf.numPages}`);
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
      } catch {
        if (!isCancelled()) setError(true);
      }
    })();
    return () => {
      run.cancelled = true;
      destroy?.();
    };
  }, [url, title, shown]);

  if (error)
    return <ErrorState message="This PDF couldn't be displayed. You can still download it." />;
  return (
    <div>
      {pages === null ? (
        <div className="text-pine-700 flex h-64 items-center justify-center">
          <Spinner label="Rendering PDF" />
        </div>
      ) : null}
      <div ref={containerRef} className="mx-auto flex max-w-[900px] flex-col gap-4" />
      {pages !== null && pages > shown ? (
        <div className="mt-4 text-center">
          <Button size="sm" onClick={() => setShown((n) => n + 5)}>
            Show more pages ({pages - shown} remaining)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
