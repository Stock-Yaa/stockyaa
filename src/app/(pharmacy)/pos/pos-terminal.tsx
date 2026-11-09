"use client";

import {
  Banknote,
  CircleCheck,
  FileText,
  CreditCard,
  Landmark,
  Minus,
  PackageSearch,
  Percent,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  ShoppingBag,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useFormat, usePharmacy } from "@/components/pharmacy-context";
import { ProductThumb } from "@/components/product-thumb";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/form";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { priceFor } from "@/lib/pricing";
import { cn, round2 } from "@/lib/utils";
import { createPosCustomer, createSale } from "./actions";
import {
  TaxBuyerFields,
  buyerFrom,
  buyerPayload,
  buyerReady,
  type TaxBuyer,
} from "../sales/tax-buyer-fields";
import { CustomerPicker, type PosCustomer } from "./customer-picker";
import { computeSaleTotals, type PaymentMethod, type SalePayload } from "./totals";

export type PosProduct = {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  barcode: string | null;
  unit: string;
  /** Regular price; member and staff prices are null when they follow it. */
  salePrice: number;
  memberPrice: number | null;
  staffPrice: number | null;
  requiresPrescription: boolean;
  categoryId: string | null;
  /** Sellable (unexpired) units on hand. */
  stock: number;
  /** The product's main photo, if it has one. */
  photoId: string | null;
  /** Expiry (YYYY-MM-DD) of the batch FEFO sells from next; null if it never expires. */
  nextExpiry: string | null;
  /** The next batch expires within the pharmacy's "expiring soon" window. */
  expiresSoon: boolean;
};

type PosCategory = { id: string; name: string };
type CartEntry = { productId: string; quantity: number };
type CartLine = { product: PosProduct; quantity: number; unitPrice: number; total: number };
type CompletedSale = {
  saleId: string;
  invoiceNumber: string;
  taxInvoiceNumber: string | null;
  total: number;
  changeDue: number;
};

const PAYMENT_OPTIONS: { value: PaymentMethod; label: MessageKey; icon: LucideIcon }[] = [
  { value: "cash", label: "sales.cash", icon: Banknote },
  { value: "card", label: "sales.card", icon: CreditCard },
  { value: "transfer", label: "sales.transfer", icon: Landmark },
];

const NOTES = [20, 50, 100, 500, 1000];

/** Amount typed into a money input; blank or invalid counts as zero. */
function parseAmount(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? round2(amount) : 0;
}

/** Likely cash amounts above `total`: the next multiple of each common note. */
function quickAmounts(total: number): number[] {
  if (total <= 0) return NOTES;
  const amounts = new Set<number>();
  for (const note of NOTES) {
    const amount = Math.ceil(total / note) * note;
    if (amount > total) amounts.add(amount);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, 5);
}

/** The selling screen: cart and payment on the left, product search and tiles on the right. */
export function PosTerminal({
  products,
  customers,
  categories,
  cashShiftId,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  categories: PosCategory[];
  /** The open session of this till's drawer; cash cannot be taken without one. */
  cashShiftId: string | null;
}) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const { vatRate, priceRules, branch } = usePharmacy();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [customerId, setCustomerId] = useState("");
  // Customers added at the till, until the refreshed list includes them.
  const [added, setAdded] = useState<PosCustomer[]>([]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [receivedInput, setReceivedInput] = useState("");
  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  // A full tax receipt the customer asked for, issued with the sale.
  const [taxBuyer, setTaxBuyer] = useState<TaxBuyer | null>(null);
  const [buyerDraft, setBuyerDraft] = useState<TaxBuyer | null>(null);
  const [pending, startTransition] = useTransition();

  // F1 jumps to the product search from anywhere on the screen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "F1") return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const usedCategories = useMemo(() => {
    const used = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => used.has(c.id));
  }, [products, categories]);
  const allCustomers = useMemo(() => {
    const known = new Set(customers.map((c) => c.id));
    return [...customers, ...added.filter((c) => !known.has(c.id))];
  }, [customers, added]);

  // Falls back to walk-in if the chosen customer was deleted in the meantime.
  const selectedCustomer = allCustomers.find((c) => c.id === customerId) ?? null;
  // The customer's price level sets every price; createSale charges the same.
  const priceLevel = selectedCustomer?.priceLevel ?? "regular";

  // Lines are derived from the latest product data, so after a refresh the
  // quantities can never exceed what is actually in stock.
  const lines: CartLine[] = cart.flatMap((entry) => {
    const product = productById.get(entry.productId);
    if (!product) return [];
    const quantity = Math.max(0, Math.min(entry.quantity, product.stock));
    const unitPrice = priceFor(product, priceLevel, priceRules);
    return [{ product, quantity, unitPrice, total: round2(quantity * unitPrice) }];
  });
  const quantityInCart = new Map(lines.map((line) => [line.product.id, line.quantity]));
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const hasUnavailable = lines.some((line) => line.quantity < 1);
  const hasPrescription = lines.some((line) => line.product.requiresPrescription);

  const totals = computeSaleTotals(
    lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
    parseAmount(discountInput),
    vatRate,
  );
  const isCash = method === "cash";
  const received = parseAmount(receivedInput);
  const paidEnough = !isCash || received >= totals.total;
  const drawerClosed = isCash && !cashShiftId;
  const canComplete = lines.length > 0 && !hasUnavailable && paidEnough && !drawerClosed && !pending;

  const term = query.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      (!categoryId || p.categoryId === categoryId) &&
      (!term ||
        p.name.toLowerCase().includes(term) ||
        (p.genericName?.toLowerCase().includes(term) ?? false) ||
        (p.barcode?.toLowerCase().includes(term) ?? false)),
  );

  /** Puts the cursor back in the search box so the next barcode scan lands there. */
  function refocusSearch() {
    // Not on touch screens, where focusing would pop up the keyboard.
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      searchRef.current?.focus();
    }
  }

  function addProduct(product: PosProduct) {
    if (product.stock <= 0) {
      toast.error(t("pos.productOutOfStock", { name: product.name }));
      return;
    }
    if ((quantityInCart.get(product.id) ?? 0) >= product.stock) {
      toast.error(
        t("pos.maxStock", { name: product.name, count: f.number(product.stock) }),
      );
      return;
    }
    setCart((current) =>
      current.some((entry) => entry.productId === product.id)
        ? current.map((entry) =>
            entry.productId === product.id
              ? { ...entry, quantity: Math.min(entry.quantity, product.stock) + 1 }
              : entry,
          )
        : [...current, { productId: product.id, quantity: 1 }],
    );
  }

  function setQuantity(product: PosProduct, quantity: number) {
    const next = Math.max(1, Math.min(quantity, product.stock));
    setCart((current) =>
      current.map((entry) =>
        entry.productId === product.id ? { ...entry, quantity: next } : entry,
      ),
    );
  }

  function removeProduct(productId: string) {
    setCart((current) => current.filter((entry) => entry.productId !== productId));
  }

  async function addCustomer(name: string) {
    try {
      const result = await createPosCustomer(name);
      if (result.ok) {
        setAdded((current) => [...current, result.customer]);
        setCustomerId(result.customer.id);
        toast.success(t("pos.customerAdded", { name: result.customer.name }));
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      unstable_rethrow(error);
      toast.error(t("common.somethingWrong"));
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    // Barcode scanners type the code and then press Enter.
    const code = event.currentTarget.value.trim();
    if (!code) return;
    const match = products.find((p) => p.barcode === code);
    if (match) {
      addProduct(match);
      setQuery("");
    } else {
      // Select the text so the next scan replaces it instead of adding to it.
      event.currentTarget.select();
    }
  }

  function completeSale() {
    if (!canComplete) return;
    const payload: SalePayload = {
      branchId: branch.id,
      items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      customerId: selectedCustomer?.id ?? null,
      discount: totals.discount,
      paymentMethod: method,
      amountPaid: isCash ? received : totals.total,
      shiftId: cashShiftId,
      taxBuyer: taxBuyer ? buyerPayload(taxBuyer, selectedCustomer?.id ?? null) : null,
    };
    startTransition(async () => {
      try {
        const result = await createSale(payload);
        if (result.ok) {
          setCart([]);
          setCustomerId("");
          setTaxBuyer(null);
          setShowDiscount(false);
          setDiscountInput("");
          setReceivedInput("");
          setMethod("cash");
          setQuery("");
          setCompleted({
            saleId: result.saleId,
            invoiceNumber: result.invoiceNumber,
            taxInvoiceNumber: result.taxInvoiceNumber,
            total: result.total,
            changeDue: result.changeDue,
          });
        } else {
          toast.error(result.message);
        }
        // Either way the stock on screen is out of date now.
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        toast.error(t("common.somethingWrong"));
      }
    });
  }

  function startNewSale() {
    setCompleted(null);
    searchRef.current?.focus();
  }

  const discountShown = showDiscount || discountInput !== "";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="min-w-0 lg:order-2">
        <Card className="p-3">
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={t("pos.searchPlaceholder")}
              aria-label={t("pos.searchPlaceholder")}
              aria-keyshortcuts="F1"
              className="h-12 pr-14 pl-10 text-base"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground sm:block">
              F1
            </kbd>
          </div>

          {usedCategories.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[{ id: "", name: t("pos.allCategories") }, ...usedCategories].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    categoryId === category.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="mt-4">
          {products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={t("pos.noProducts")}
              hint={t("pos.noProductsHint")}
            />
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={t("pos.noMatches")}
              hint={t("pos.noMatchesHint")}
            />
          ) : (
            // Scrolls on its own on small screens so the cart stays within reach.
            // The padding leaves room for the "in cart" bubbles on the tiles.
            <div className="-m-2 grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto p-2 sm:grid-cols-3 lg:max-h-none lg:grid-cols-2 lg:overflow-visible xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  inCart={quantityInCart.get(product.id) ?? 0}
                  price={priceFor(product, priceLevel, priceRules)}
                  onAdd={() => {
                    addProduct(product);
                    refocusSearch();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Card className="flex flex-col lg:sticky lg:top-18 lg:order-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto">
        <div className="space-y-3 border-b border-border p-4">
          <h1 className="text-xl font-semibold tracking-tight">{t("pos.title")}</h1>
          <CustomerPicker
            customers={allCustomers}
            selected={selectedCustomer}
            onSelect={(customer) => setCustomerId(customer?.id ?? "")}
            onCreate={addCustomer}
            disabled={pending}
          />
          {taxBuyer && (
            <div className="flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">
              <FileText className="size-4 shrink-0" />
              <button
                type="button"
                onClick={() => setBuyerDraft(taxBuyer)}
                className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
              >
                {t("pos.taxReceiptFor", { name: taxBuyer.buyerName })}
              </button>
              <button
                type="button"
                onClick={() => setTaxBuyer(null)}
                aria-label={t("pos.removeTaxReceipt")}
                title={t("pos.removeTaxReceipt")}
                className="-mr-1 rounded-md p-1 hover:bg-background/60"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <h2 className="font-semibold">
            {t("pos.cart")}{" "}
            <span className="text-primary tabular-nums">({f.number(unitCount)})</span>
          </h2>
          <DropdownMenu
            label={t("pos.more")}
            items={[
              {
                label: discountShown ? t("pos.removeDiscount") : t("pos.addDiscount"),
                icon: Percent,
                disabled: pending,
                onSelect: () => {
                  if (discountShown) setDiscountInput("");
                  setShowDiscount(!discountShown);
                },
              },
              // Tax receipts need a VAT-registered pharmacy.
              ...(vatRate > 0
                ? [
                    {
                      label: taxBuyer ? t("pos.editTaxReceipt") : t("pos.requestTaxReceipt"),
                      icon: FileText,
                      disabled: pending,
                      onSelect: () => setBuyerDraft(taxBuyer ?? buyerFrom(selectedCustomer)),
                    },
                  ]
                : []),
              {
                label: t("pos.clearCart"),
                icon: Trash2,
                tone: "danger",
                disabled: pending || lines.length === 0,
                onSelect: () => {
                  setCart([]);
                  refocusSearch();
                },
              },
            ]}
          />
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center lg:min-h-48 lg:flex-1 lg:justify-center">
            <ShoppingBag className="size-12 text-muted-foreground/50" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-muted-foreground">{t("pos.cartEmpty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">{t("pos.cartEmptyHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border px-4 lg:min-h-44 lg:flex-1 lg:overflow-y-auto">
            {lines.map((line) => (
              <CartRow
                key={line.product.id}
                line={line}
                disabled={pending}
                onQuantity={(quantity) => setQuantity(line.product, quantity)}
                onRemove={() => removeProduct(line.product.id)}
                onDone={refocusSearch}
              />
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border p-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("sales.paymentMethod")}</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={method === option.value}
                  onClick={() => setMethod(option.value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-sm leading-tight font-medium transition-colors sm:flex-row sm:gap-1.5",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    method === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <option.icon className="size-4" />
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>

          {drawerClosed && (
            <p className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("pos.cashNeedsDrawer")}{" "}
                <Link href="/cash-drawer" className="font-medium underline">
                  {t("pos.openDrawer")}
                </Link>
              </span>
            </p>
          )}

          {isCash && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="pos-received" className="text-sm font-medium">
                  {t("pos.amountReceived")}
                </label>
                <Input
                  id="pos-received"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={receivedInput}
                  onChange={(e) => setReceivedInput(e.target.value)}
                  placeholder="0.00"
                  className="h-10 w-36 text-right text-base tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickAmounts(totals.total).map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    className="tabular-nums"
                    disabled={lines.length === 0}
                    onClick={() => setReceivedInput(String(amount))}
                  >
                    {f.number(amount)}
                  </Button>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={lines.length === 0}
                  onClick={() => setReceivedInput(String(totals.total))}
                >
                  {t("pos.exact")}
                </Button>
              </div>
              {lines.length > 0 && received > 0 && received >= totals.total && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-success/15 px-3 py-2 text-success">
                  <span className="text-sm font-medium">{t("sales.change")}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {f.money(round2(received - totals.total))}
                  </span>
                </div>
              )}
            </div>
          )}

          {discountShown && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="pos-discount" className="text-sm font-medium">
                {t("pos.discount")}
              </label>
              <Input
                id="pos-discount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                autoFocus
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="0.00"
                className="h-9 w-36 text-right tabular-nums"
              />
            </div>
          )}

          <dl className="space-y-1.5 px-1 text-sm">
            <SummaryRow label={t("sales.subtotal")} value={f.money(totals.subtotal)} />
            {totals.discount > 0 && (
              <SummaryRow label={t("pos.discount")} value={`−${f.money(totals.discount)}`} />
            )}
          </dl>
          {totals.discount > 0 && priceLevel !== "regular" && (
            <p className="px-1 text-xs text-warning">{t("pos.discountOnLevel")}</p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-accent-foreground">
            <span className="text-sm font-semibold tracking-wide uppercase">
              {t("sales.total")}
            </span>
            <span className="text-3xl font-bold text-primary tabular-nums">
              {f.money(totals.total)}
            </span>
          </div>
          {vatRate > 0 && (
            <p className="-mt-1 px-1 text-right text-xs text-muted-foreground tabular-nums">
              {t("pos.vatIncluded", { rate: f.number(vatRate), amount: f.money(totals.tax) })}
            </p>
          )}

          {hasPrescription && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm text-warning"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>{t("pos.rxNotice")}</p>
            </div>
          )}

          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={!canComplete}
            onClick={completeSale}
          >
            <ReceiptText />
            {pending
              ? t("pos.processing")
              : t("pos.completeSaleAmount", { amount: f.money(totals.total) })}
          </Button>
        </div>
      </Card>

      <Modal
        open={buyerDraft !== null}
        onClose={() => setBuyerDraft(null)}
        title={t("pos.taxReceiptTitle")}
        description={t("pos.taxReceiptHint")}
        size="lg"
      >
        {buyerDraft && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setTaxBuyer(buyerDraft);
              setBuyerDraft(null);
            }}
            className="grid gap-4"
          >
            <TaxBuyerFields value={buyerDraft} onChange={setBuyerDraft} hasCustomer={selectedCustomer !== null} />
            <ModalFooter>
              <Button variant="outline" onClick={() => setBuyerDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!buyerReady(buyerDraft)}>
                {t("pos.useTaxReceipt")}
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>

      <Modal
        open={completed !== null}
        onClose={startNewSale}
        title={t("pos.saleCompleted")}
        size="sm"
      >
        {completed && (
          <>
            <div className="flex flex-col items-center text-center">
              <CircleCheck className="size-12 text-success" />
              <p className="mt-3 text-sm text-muted-foreground">{t("sales.invoice")}</p>
              <p className="text-lg font-semibold">{completed.invoiceNumber}</p>
              {completed.taxInvoiceNumber && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pos.taxReceiptIssued", { number: completed.taxInvoiceNumber })}
                </p>
              )}
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <SummaryRow label={t("sales.total")} value={f.money(completed.total)} strong />
              <SummaryRow label={t("sales.change")} value={f.money(completed.changeDue)} strong />
            </dl>
            <ModalFooter>
              <Link
                href={`/sales/${completed.saleId}?print=1`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: "outline" })}
              >
                <Printer />
                {t("pos.printReceipt")}
              </Link>
              {completed.taxInvoiceNumber && (
                <Link
                  href={`/sales/${completed.saleId}/tax-receipt?print=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline" })}
                >
                  <FileText />
                  {t("pos.printTaxReceipt")}
                </Link>
              )}
              <Button autoFocus onClick={startNewSale}>
                <Plus />
                {t("pos.newSale")}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "text-base font-semibold")}>{value}</dd>
    </div>
  );
}

function ProductTile({
  product,
  inCart,
  price,
  onAdd,
}: {
  product: PosProduct;
  inCart: number;
  /** The price at the selected customer's level. */
  price: number;
  onAdd: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const soldOut = product.stock <= 0;
  const details = [product.genericName, product.strength].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={onAdd}
      className={cn(
        "relative flex min-h-28 flex-col rounded-xl border border-border bg-card p-3.5 text-left shadow-xs transition-colors",
        "hover:border-primary hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        inCart > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2">
          {product.photoId && <ProductThumb photoId={product.photoId} label="" size={36} />}
          <span className="leading-snug font-semibold">{product.name}</span>
        </span>
        {(product.requiresPrescription || product.expiresSoon) && (
          <span className="flex shrink-0 flex-wrap justify-end gap-1">
            {product.requiresPrescription && (
              <Badge tone="danger" title={t("pos.rxTitle")}>
                {t("pos.rx")}
              </Badge>
            )}
            {product.expiresSoon && (
              <Badge
                tone="warning"
                title={t("pos.expiresOn", { date: f.day(product.nextExpiry) })}
              >
                {t("pos.expSoon")}
              </Badge>
            )}
          </span>
        )}
      </span>
      {details && (
        <span className="mt-1 line-clamp-1 text-xs text-muted-foreground uppercase">
          {details}
        </span>
      )}
      <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-3">
        <span className="font-semibold text-primary tabular-nums">
          {f.money(price)}
          {price !== product.salePrice && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
              {f.money(product.salePrice)}
            </span>
          )}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            soldOut ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
          )}
        >
          {soldOut
            ? t("pos.outOfStock")
            : t("pos.inStock", { count: f.number(product.stock), unit: product.unit })}
        </span>
      </span>
      {inCart > 0 && (
        <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
          <span aria-hidden>{inCart}</span>
          <span className="sr-only">{t("pos.inCart", { count: inCart })}</span>
        </span>
      )}
    </button>
  );
}

function CartRow({
  line,
  disabled,
  onQuantity,
  onRemove,
  onDone,
}: {
  line: CartLine;
  disabled: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  /** Called after a button press, to hand focus back to the search box. */
  onDone: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const { product, quantity } = line;
  const stepClass =
    "flex size-8 items-center justify-center text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{product.name}</span>
          {product.requiresPrescription && (
            <Badge tone="danger" title={t("pos.rxTitle")}>
              {t("pos.rx")}
            </Badge>
          )}
        </p>
        <p className="text-sm font-semibold tabular-nums">{f.money(line.total)}</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="truncate text-xs text-muted-foreground">
          {t("pos.unitPrice", { price: f.money(line.unitPrice), unit: product.unit })}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {quantity < 1 ? (
            <p className="text-sm font-medium text-destructive">{t("pos.outOfStock")}</p>
          ) : (
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-input">
              <button
                type="button"
                aria-label={t("pos.decrease")}
                disabled={disabled || quantity <= 1}
                onClick={() => {
                  onQuantity(quantity - 1);
                  onDone();
                }}
                className={stepClass}
              >
                <Minus className="size-4" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={t("pos.quantityOf", { name: product.name })}
                disabled={disabled}
                value={quantity}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const typed = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                  if (!Number.isNaN(typed)) onQuantity(typed);
                }}
                className="h-8 w-11 border-x border-input bg-transparent text-center text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              />
              <button
                type="button"
                aria-label={t("pos.increase")}
                disabled={disabled || quantity >= product.stock}
                onClick={() => {
                  onQuantity(quantity + 1);
                  onDone();
                }}
                className={stepClass}
              >
                <Plus className="size-4" />
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("pos.remove")}
            title={t("pos.remove")}
            disabled={disabled}
            onClick={() => {
              onRemove();
              onDone();
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}
