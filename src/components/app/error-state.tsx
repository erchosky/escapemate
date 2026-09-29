import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description,
  homeLabel,
  retryLabel,
  onRetry,
  code,
}: {
  title: string;
  description: string;
  homeLabel: string;
  retryLabel?: string;
  onRetry?: () => void;
  code?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <ShieldAlert className="h-7 w-7 text-lime-300" />
      </div>
      {code ? <div className="mt-5 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{code}</div> : null}
      <h1 className="mt-2 text-2xl font-bold text-zinc-50">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {onRetry && retryLabel ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
        <Button asChild variant="outline">
          <Link href="/">{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
