import { ERPShell } from "@/components/layout/erp-shell"

export default function ERPLayout({ children }: { children: React.ReactNode }) {
  return <ERPShell>{children}</ERPShell>
}
