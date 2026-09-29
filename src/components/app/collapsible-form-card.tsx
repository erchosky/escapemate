"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// On phones the create form starts folded so the list of live posts is the first thing you see;
// from lg upwards it is always expanded (pure CSS, so no hydration mismatch).
export function CollapsibleFormCard({
  title,
  description,
  toggleLabel,
  defaultOpen = false,
  children,
  extra,
}: {
  title: string;
  description: string;
  toggleLabel: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="h-fit">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant={open ? "outline" : "default"}
            className="shrink-0 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4 rotate-180" /> : <Plus className="h-4 w-4" />}
            {toggleLabel}
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
        {extra}
      </CardHeader>
      <CardContent className={cn(open ? "block" : "hidden", "lg:block")}>{children}</CardContent>
    </Card>
  );
}
