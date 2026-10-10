import { PortalShell } from "@/components/portal/portal-shell";
import { PortalErrorBoundary } from "@/components/portal/portal-error-boundary";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell>
      <PortalErrorBoundary>{children}</PortalErrorBoundary>
    </PortalShell>
  );
}
