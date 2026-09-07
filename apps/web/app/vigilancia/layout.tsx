import { VigilanciaShell } from "@/components/vigilancia/vigilancia-shell";

export default function VigilanciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VigilanciaShell>{children}</VigilanciaShell>;
}
