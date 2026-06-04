import { fetchCredentials, getAuthHeaders } from "@/lib/client-auth"

export async function downloadSalesOrderInvoice(orderId: string): Promise<void> {
  const res = await fetch(`/api/sales-orders/${encodeURIComponent(orderId)}/invoice`, {
    credentials: fetchCredentials,
    headers: getAuthHeaders(),
  })

  if (!res.ok) {
    let message = "Failed to download invoice"
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* HTML or empty body */
    }
    throw new Error(message)
  }

  const html = await res.text()
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${orderId}-invoice.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
