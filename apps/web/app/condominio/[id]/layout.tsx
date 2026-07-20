import { CondominioShell } from "@/components/condominio-shell";

export default function CondominioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CondominioShell>{children}</CondominioShell>;
}
