import * as fs from 'fs';

const file = 'd:/erp-prototype/app/(erp)/orders/[id]/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetStart = code.indexOf('<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">');
const targetEnd = code.indexOf('{/* Dialogs */}');

const targetStr = code.substring(targetStart, targetEnd);
const tableStart = targetStr.indexOf('<Table>');
const tableEnd = targetStr.indexOf('</div>\n        </div>\n\n        {/* Right Column: Timeline & Logistics */}');

const lineItemsContent = targetStr.substring(tableStart, tableEnd);

// Assemble new layout
const newLayout = `      {/* Banner Actions */}
      <div className="space-y-4 mb-6">
        {(order.status === "NEEDS_RESTOCK") && (() => {
          if (!hasShortages) {
            return (
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 dark:border-teal-500/30 dark:bg-teal-500/5 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-teal-400 to-emerald-500" />

                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle size={20} className="text-teal-600 dark:text-teal-500" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base">Stock Available</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Inventory has sufficient stock for this order. {isInventory ? "Fulfill it to proceed to shipping." : "Please notify the inventory team to fulfill it."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-teal-200/60 dark:border-teal-500/20 flex gap-2">
                    {isInventory ? (
                      <Button
                        size="sm"
                        disabled={restocking}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={handleFulfillOrder}
                      >
                        {restocking ? (
                          <Spinner size={14} className="mr-2 animate-spin" />
                        ) : (
                          <CheckCircle size={14} className="mr-2" />
                        )}
                        Fulfill Order
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={nudging}
                        className="w-full bg-white hover:bg-teal-50 text-teal-700 border-teal-200 dark:bg-transparent dark:hover:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/30"
                        onClick={handleNudgeInventory}
                      >
                        {nudging ? (
                          <Spinner size={14} className="mr-2 animate-spin" />
                        ) : (
                          <BellRinging size={14} className="mr-2" />
                        )}
                        Nudge Inventory
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="glass-card overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-amber-400 to-orange-500" />

              <div className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                    <Warning size={24} className="text-amber-600 dark:text-amber-500" weight="duotone" />
                  </div>
                  <div className="pt-0.5">
                    <h3 className="font-bold text-foreground text-lg">Fulfillment Blocked</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Order is awaiting inventory restock.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-400">Missing Items</h4>
                  <div className="space-y-3">
                    {currentShortages.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-muted/20 hover:bg-muted/30 transition-colors p-3 rounded-xl border border-border/60 shadow-sm">
                        {s.image ? (
                          <img src={s.image} alt={s.name} className="w-8 h-8 rounded object-cover shrink-0 border" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package size={14} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold truncate text-foreground leading-tight mb-1">{s.name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{s.sku}</div>
                        </div>
                        <div className="text-right shrink-0 pr-2">
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-500 mb-0.5">Need {s.required - s.available}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">Have {s.available}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-amber-200/60 dark:border-amber-500/20 flex gap-2">
                  {isInventory ? (
                    <Button
                      size="sm"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={openRestockDialog}
                    >
                      <Package size={14} className="mr-2" />
                      Restock Items
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={nudging}
                      className="w-full bg-white hover:bg-amber-50 text-amber-700 border-amber-200 dark:bg-transparent dark:hover:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
                      onClick={handleNudgeInventory}
                    >
                      {nudging ? (
                        <Spinner size={14} className="mr-2 animate-spin" />
                      ) : (
                        <BellRinging size={14} className="mr-2" />
                      )}
                      Nudge Inventory
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Customer Details */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <UserCircle size={14} weight="bold" /> Customer Details
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Name</div>
              <div className="text-sm font-semibold">{cust?.name || "Unknown"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Email</div>
              <div className="text-sm font-medium">{cust?.email || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Address</div>
              <div className="text-sm font-medium">{cust?.address || "—"}</div>
            </div>
          </div>
        </div>

        {/* Logistics Details */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <Truck weight="bold" size={14} /> Logistics Details
          </h3>
          {(order.tracking_number || order.carrier || order.status === "SHIPPED") ? (
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">Carrier</div>
                <div className="text-sm font-medium">{order.carrier || "Not specified"}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">Tracking Number</div>
                <div className="text-sm font-mono font-bold text-foreground">{order.tracking_number || "Pending"}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[100px] text-sm text-muted-foreground">
              <div className="opacity-40 mb-2"><Package size={24} /></div>
              <span>Pending shipping</span>
            </div>
          )}
        </div>

        {/* Order Metadata */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
             <FileText weight="bold" size={14} /> Order Metadata
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Created At</div>
              <div className="text-sm font-medium">{formatDate(order.createdAt)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Last Updated</div>
              <div className="text-sm font-medium">{formatDate(order.updatedAt)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Sales rep</div>
              <div className="text-sm font-medium">{order.salesPersonName ?? order.createdBy ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b bg-muted/5 flex items-center gap-2">
          <ShoppingCart size={16} weight="bold" className="text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Line Items</h3>
        </div>
        ` + lineItemsContent + `
      </div>\n\n      `;

code = code.substring(0, targetStart) + newLayout + code.substring(targetEnd);
fs.writeFileSync(file, code);
