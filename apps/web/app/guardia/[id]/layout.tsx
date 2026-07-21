import { GuardiaShell } from "@/components/guardia/guardia-shell";

export default function GuardiaLayout({ children }: { children: React.ReactNode }) {
  return <GuardiaShell>{children}</GuardiaShell>;
}
