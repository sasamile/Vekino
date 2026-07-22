import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4 px-4 py-6 sm:px-7 sm:py-6", className)}>
      {children}
    </div>
  );
}
