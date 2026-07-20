import { Check, type LucideIcon } from "lucide-react";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ModulePlaceholder({
  icon: Icon,
  title,
  description,
  features,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <PageContainer>
      <div className="space-y-8">
        <PageHeader
          title={title}
          description={description}
          action={<Badge tone="warning">En construcción</Badge>}
        />

        <Card className="overflow-hidden">
          <div className="flex flex-col items-center gap-4 border-b border-border bg-muted/30 px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card text-brand ring-1 ring-border">
              <Icon className="h-7 w-7" aria-hidden />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                Este módulo llega pronto
              </h3>
              <p className="text-sm text-muted-foreground">
                Estamos migrando <span className="font-medium text-foreground">{title}</span> con
                un diseño renovado. Esto es lo que podrás hacer:
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 px-6 py-3.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                <span className="text-sm text-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageContainer>
  );
}
