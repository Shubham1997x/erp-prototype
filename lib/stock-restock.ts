export type StockAdjustResponse = {
  ok: boolean
  autoFulfilledOrders?: string[]
}

export function restockToastMessage(
  qty: number,
  productName: string,
  autoFulfilledOrders?: string[]
): string {
  const base = `Added ${qty} units to ${productName}`
  const ids = autoFulfilledOrders ?? []
  if (ids.length === 0) return base
  if (ids.length === 1) return `${base}. Order ${ids[0]} is now ready to ship.`
  return `${base}. ${ids.length} orders are now ready to ship (${ids.join(", ")}).`
}
