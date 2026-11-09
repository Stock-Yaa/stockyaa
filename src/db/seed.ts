import { hash } from "bcryptjs";
import { addDays, todayInTimezone } from "@/lib/dates";
import {
  addBatch,
  deductStockFefo,
  nextInvoiceNumber,
  nextPurchaseReference,
  nextTransferReference,
} from "@/lib/stock";
import { round2 } from "@/lib/utils";
import type { Db, Tx } from "./index";
import {
  billingPayments,
  branches,
  categories,
  customers,
  expenseCategories,
  expenses,
  pharmacies,
  plans,
  products,
  purchaseItems,
  purchases,
  refillReminders,
  saleItems,
  sales,
  stockTransferItems,
  stockTransfers,
  suppliers,
  users,
} from "./schema";

/** Sign-in details for the demo data (local embedded database only). */
export const DEMO_ACCOUNTS = {
  superadmin: { email: "superadmin@stockyaa.com", password: "stockyaa123" },
  admin: { email: "admin@demo-pharmacy.com", password: "stockyaa123" },
  staff: { email: "staff@demo-pharmacy.com", password: "stockyaa123" },
};
// Manager of the Sukhumvit branch, same password as the other demo accounts.
const DEMO_MANAGER_EMAIL = "manager@demo-pharmacy.com";

type SeedOptions = {
  /** Also create a demo pharmacy with products, stock and sales. */
  demo: boolean;
  /** Super admin to create; defaults to the demo super admin. */
  superAdmin?: { name: string; email: string; password: string };
};

// [name, generic, category, form, strength, unit, sale, cost, reorder, rx]
const DEMO_PRODUCTS: [string, string, string, string, string, string, number, number, number, boolean][] = [
  ["Tylenol 500", "Paracetamol", "Pain relief", "Tablet", "500 mg", "strip", 15, 9, 40, false],
  ["Sara", "Paracetamol", "Pain relief", "Tablet", "500 mg", "strip", 12, 7, 40, false],
  ["Nurofen", "Ibuprofen", "Pain relief", "Tablet", "400 mg", "strip", 45, 28, 20, false],
  ["Amoxil", "Amoxicillin", "Antibiotics", "Capsule", "500 mg", "strip", 60, 38, 20, true],
  ["Zithromax", "Azithromycin", "Antibiotics", "Tablet", "250 mg", "box", 180, 120, 10, true],
  ["Zyrtec", "Cetirizine", "Allergy", "Tablet", "10 mg", "strip", 55, 34, 20, false],
  ["Clarityne", "Loratadine", "Allergy", "Tablet", "10 mg", "strip", 65, 41, 20, false],
  ["CPM", "Chlorpheniramine", "Allergy", "Tablet", "4 mg", "strip", 10, 5, 30, false],
  ["Losec", "Omeprazole", "Digestive", "Capsule", "20 mg", "strip", 85, 52, 15, false],
  ["Antacil Gel", "Aluminium hydroxide", "Digestive", "Suspension", "240 ml", "bottle", 75, 48, 10, false],
  ["ORS Royal-D", "Oral rehydration salts", "Digestive", "Powder", "25 g", "sachet", 8, 4, 50, false],
  ["Vitamin C 1000", "Ascorbic acid", "Vitamins", "Tablet", "1000 mg", "bottle", 220, 150, 10, false],
  ["Centrum", "Multivitamin", "Vitamins", "Tablet", "", "bottle", 390, 280, 8, false],
  ["Betadine Solution", "Povidone iodine", "First aid", "Solution", "30 ml", "bottle", 65, 42, 12, false],
  ["Elastic Bandage", "", "First aid", "", "3 inch", "roll", 40, 22, 15, false],
];

/** Small deterministic generator so demo data is the same on every machine. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Fills an empty database: plans and a super admin, plus (with `demo`) a demo
 * pharmacy. Does nothing if any user already exists. Returns true if it seeded.
 */
export async function seedDatabase(db: Db, options: SeedOptions): Promise<boolean> {
  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) return false;

  const superAdmin = options.superAdmin ?? {
    name: "Platform Admin",
    ...DEMO_ACCOUNTS.superadmin,
  };

  await db.transaction(async (tx) => {
    const [standard, multiBranch] = await tx
      .insert(plans)
      .values([
        { name: "Standard", type: "standard", description: "One branch with one admin: full stock, sales, purchasing and reports.", priceMonthly: 990, priceYearly: 9900, maxBranches: 1, sortOrder: 1 },
        { name: "Multi Branch", type: "multi_branch", description: "Up to 10 branches, stock transfers and any number of admins.", priceMonthly: 2490, priceYearly: 24900, maxBranches: 10, sortOrder: 2 },
      ])
      .returning();

    const [platformAdmin] = await tx.insert(users).values({
      name: superAdmin.name,
      email: superAdmin.email.toLowerCase(),
      passwordHash: await hash(superAdmin.password, 10),
      role: "superadmin",
    }).returning();

    if (!options.demo) return;

    const timezone = "Asia/Bangkok";
    const today = todayInTimezone(timezone);
    const random = createRandom(42);

    const [pharmacy] = await tx
      .insert(pharmacies)
      .values({
        name: "Demo Pharmacy",
        email: "hello@demo-pharmacy.com",
        phone: "02-123-4567",
        address: "123 Sukhumvit Road, Bangkok 10110",
        licenseNumber: "DEMO-0001",
        taxId: "0105555012345",
        vatRegistered: true,
        memberDiscount: 5,
        timezone,
        planId: multiBranch.id,
        subscriptionStatus: "active",
        subscriptionEndsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        receiptFooter: "Thank you. Get well soon!",
        createdAt: daysAgo(170),
      })
      .returning();
    const pharmacyId = pharmacy.id;

    // Two branches: the original shop and a newer one, with a staff member.
    const [main, silom] = await tx
      .insert(branches)
      .values([
        { pharmacyId, name: "Sukhumvit", code: "SKV", taxBranchCode: "00000", address: pharmacy.address, phone: pharmacy.phone, createdAt: daysAgo(170) },
        { pharmacyId, name: "Silom", code: "SLM", taxBranchCode: "00001", address: "45 Silom Road, Bangkok 10500", phone: "02-234-5678", createdAt: daysAgo(60) },
      ])
      .returning();
    await tx.insert(users).values({
      name: "Demo Staff",
      email: DEMO_ACCOUNTS.staff.email,
      passwordHash: await hash(DEMO_ACCOUNTS.staff.password, 10),
      role: "staff",
      pharmacyId,
      branchId: silom.id,
    });
    await tx.insert(users).values({
      name: "Demo Manager",
      email: DEMO_MANAGER_EMAIL,
      passwordHash: await hash(DEMO_ACCOUNTS.staff.password, 10),
      role: "manager",
      pharmacyId,
      branchId: main.id,
    });

    const [admin] = await tx
      .insert(users)
      .values({
        name: "Demo Admin",
        email: DEMO_ACCOUNTS.admin.email,
        passwordHash: await hash(DEMO_ACCOUNTS.admin.password, 10),
        role: "admin",
        pharmacyId,
      })
      .returning();

    const categoryNames = [...new Set(DEMO_PRODUCTS.map((p) => p[2]))];
    const categoryRows = await tx
      .insert(categories)
      .values(categoryNames.map((name) => ({ pharmacyId, name })))
      .returning();
    const categoryId = new Map(categoryRows.map((c) => [c.name, c.id]));

    const productRows = await tx
      .insert(products)
      .values(
        DEMO_PRODUCTS.map(([name, generic, category, form, strength, unit, sale, cost, reorder, rx], i) => ({
          pharmacyId,
          name,
          genericName: generic || null,
          categoryId: categoryId.get(category) ?? null,
          manufacturer: null,
          dosageForm: form || null,
          strength: strength || null,
          barcode: `885000000${String(i + 1).padStart(4, "0")}`,
          unit,
          salePrice: sale,
          // About 5% off for members; staff buy at cost plus 10%.
          memberPrice: Math.floor(sale * 0.95),
          staffPrice: Math.min(sale, Math.ceil(cost * 1.1)),
          costPrice: cost,
          reorderLevel: reorder,
          requiresPrescription: rx,
        })),
      )
      .returning();

    const supplierRows = await tx
      .insert(suppliers)
      .values([
        { pharmacyId, name: "Siam Pharma Supply", contactPerson: "Khun Anan", phone: "02-555-0101", email: "sales@siampharma.example" },
        { pharmacyId, name: "Bangkok Medical Wholesale", contactPerson: "Khun Malee", phone: "02-555-0202", email: "order@bmw.example" },
      ])
      .returning();

    const customerRows = await tx
      .insert(customers)
      .values([
        { pharmacyId, name: "Somchai Jaidee", phone: "081-234-5678", priceLevel: "member" },
        { pharmacyId, name: "Suda Rakdee", phone: "089-876-5432" },
        { pharmacyId, name: "John Smith", phone: "062-111-2233", email: "john@example.com" },
        { pharmacyId, name: "Nok Sriwan", phone: "086-555-1212", notes: "Pharmacy assistant", priceLevel: "staff" },
      ])
      .returning();

    // Regular medicines: one overdue, one due in two days, one later on.
    await tx.insert(refillReminders).values(
      (
        [
          [0, 1, 30, -32],
          [1, 3, 30, -28],
          [2, 5, 60, -20],
        ] as const
      ).map(([customer, product, intervalDays, lastDays]) => ({
        pharmacyId,
        customerId: customerRows[customer].id,
        productId: productRows[product].id,
        intervalDays,
        lastRefillDate: addDays(today, lastDays),
        nextDueDate: addDays(today, lastDays + intervalDays),
      })),
    );

    // Opening stock: most products get a healthy batch, with a few made low,
    // expiring soon or already expired so the alerts have something to show.
    for (const [i, product] of productRows.entries()) {
      const base = {
        pharmacyId,
        branchId: main.id,
        productId: product.id,
        costPrice: product.costPrice,
        type: "opening" as const,
        userId: admin.id,
      };
      const lowStock = i === 4 || i === 12;
      await addBatch(tx, {
        ...base,
        quantity: lowStock ? 4 : 120 + Math.floor(random() * 80),
        batchNumber: `LOT-A${String(i + 1).padStart(3, "0")}`,
        expiryDate: addDays(today, 240 + Math.floor(random() * 300)),
      });
      if (i === 1 || i === 7) {
        await addBatch(tx, { ...base, quantity: 30, batchNumber: `LOT-B${String(i + 1).padStart(3, "0")}`, expiryDate: addDays(today, 25) });
      }
      if (i === 10) {
        await addBatch(tx, { ...base, quantity: 20, batchNumber: "LOT-X011", expiryDate: addDays(today, -10) });
      }
      // Silom carries less, and has run low on a few lines.
      if (i !== 10) {
        await addBatch(tx, {
          ...base,
          branchId: silom.id,
          quantity: i === 2 || i === 8 ? 18 : 60 + Math.floor(random() * 40),
          batchNumber: `LOT-S${String(i + 1).padStart(3, "0")}`,
          expiryDate: addDays(today, 200 + Math.floor(random() * 300)),
        });
      }
    }

    // One received purchase and one still on order.
    const receivedRef = await nextPurchaseReference(tx, pharmacyId, today, main.id);
    const receivedLines = [productRows[0], productRows[3], productRows[5]].map((p) => ({
      product: p,
      quantity: 100,
      batchNumber: `LOT-P${p.barcode?.slice(-3)}`,
      expiryDate: addDays(today, 500),
    }));
    const [received] = await tx
      .insert(purchases)
      .values({
        pharmacyId,
        branchId: main.id,
        reference: receivedRef,
        supplierId: supplierRows[0].id,
        supplierInvoice: "SPS-2291",
        status: "received",
        total: round2(receivedLines.reduce((s, l) => s + l.quantity * l.product.costPrice, 0)),
        orderedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
        receivedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        userId: admin.id,
      })
      .returning();
    for (const line of receivedLines) {
      await tx.insert(purchaseItems).values({
        purchaseId: received.id,
        productId: line.product.id,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        quantity: line.quantity,
        costPrice: line.product.costPrice,
      });
      await addBatch(tx, {
        pharmacyId,
        branchId: main.id,
        productId: line.product.id,
        quantity: line.quantity,
        costPrice: line.product.costPrice,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        purchaseId: received.id,
        type: "purchase",
        userId: admin.id,
      });
    }

    const orderedRef = await nextPurchaseReference(tx, pharmacyId, today, main.id);
    const [ordered] = await tx
      .insert(purchases)
      .values({
        pharmacyId,
        branchId: main.id,
        reference: orderedRef,
        supplierId: supplierRows[1].id,
        status: "ordered",
        total: round2(50 * productRows[4].costPrice + 30 * productRows[12].costPrice),
        userId: admin.id,
      })
      .returning();
    await tx.insert(purchaseItems).values([
      { purchaseId: ordered.id, productId: productRows[4].id, quantity: 50, costPrice: productRows[4].costPrice },
      { purchaseId: ordered.id, productId: productRows[12].id, quantity: 30, costPrice: productRows[12].costPrice },
    ]);

    // Two weeks of sales, oldest first so invoice numbers run in date order.
    const sellable = productRows.filter((_, i) => i !== 4 && i !== 12 && i !== 10);
    const methods = ["cash", "cash", "cash", "transfer", "card"] as const;
    for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
      const salesToday = 2 + Math.floor(random() * 4);
      for (let n = 0; n < salesToday; n++) {
        const createdAt = new Date(
          Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(random() * 6 * 60 * 60 * 1000),
        );
        const lineCount = 1 + Math.floor(random() * 3);
        const picked = new Map<string, { product: (typeof productRows)[number]; quantity: number }>();
        for (let l = 0; l < lineCount; l++) {
          const product = sellable[Math.floor(random() * sellable.length)];
          const current = picked.get(product.id);
          picked.set(product.id, {
            product,
            quantity: (current?.quantity ?? 0) + 1 + Math.floor(random() * 2),
          });
        }
        const lines = [...picked.values()];
        // About a third of the sales happen in Silom.
        const branchId = random() < 0.35 ? silom.id : main.id;
        const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.product.salePrice, 0));
        const invoiceNumber = await nextInvoiceNumber(tx, pharmacyId, today, branchId);
        const [sale] = await tx
          .insert(sales)
          .values({
            pharmacyId,
            branchId,
            invoiceNumber,
            customerId: random() < 0.3 ? customerRows[Math.floor(random() * customerRows.length)].id : null,
            userId: admin.id,
            subtotal,
            // Prices include 7% VAT.
            tax: round2((subtotal * 7) / 107),
            total: subtotal,
            paymentMethod: methods[Math.floor(random() * methods.length)],
            amountPaid: subtotal,
            createdAt,
          })
          .returning();
        for (const line of lines) {
          const taken = await deductStockFefo(tx, {
            pharmacyId,
            branchId,
            productId: line.product.id,
            quantity: line.quantity,
            today,
            type: "sale",
            referenceId: sale.id,
            userId: admin.id,
          });
          for (const part of taken) {
            await tx.insert(saleItems).values({
              saleId: sale.id,
              productId: line.product.id,
              batchId: part.batchId,
              productName: line.product.name,
              quantity: part.quantity,
              unitPrice: line.product.salePrice,
              costPrice: part.costPrice,
              total: round2(part.quantity * line.product.salePrice),
            });
          }
        }
      }
    }

    // Stock moved between the branches: one received, one still on its way.
    await seedTransfer(tx, {
      pharmacyId,
      from: main.id,
      to: silom.id,
      lines: [[productRows[0].id, 20], [productRows[5].id, 15]],
      today,
      userId: admin.id,
      sentAt: daysAgo(5),
      receive: true,
    });
    await seedTransfer(tx, {
      pharmacyId,
      from: main.id,
      to: silom.id,
      lines: [[productRows[2].id, 24], [productRows[8].id, 12]],
      today,
      userId: admin.id,
      sentAt: daysAgo(0),
      receive: false,
    });

    // Running costs: monthly rent, salaries and utilities, plus small supplies.
    // Rent and bills belong to each branch; salaries to the whole business.
    const [rent, salaries, utilities, supplies] = await tx
      .insert(expenseCategories)
      .values([
        { pharmacyId, name: "Rent", color: "indigo" },
        { pharmacyId, name: "Salaries", color: "teal" },
        { pharmacyId, name: "Utilities", color: "amber" },
        { pharmacyId, name: "Supplies", color: "green" },
      ])
      .returning();
    const expenseRows: (typeof expenses.$inferInsert)[] = [];
    for (let month = 0; month < 6; month++) {
      const day = addDays(today, -(month * 30 + 3));
      expenseRows.push(
        { pharmacyId, branchId: main.id, categoryId: rent.id, expenseDate: day, amount: 18000, description: "Shop rent", userId: admin.id },
        { pharmacyId, branchId: null, categoryId: salaries.id, expenseDate: day, amount: 32000, description: "Staff salaries", userId: admin.id },
        { pharmacyId, branchId: main.id, categoryId: utilities.id, expenseDate: addDays(day, -5), amount: round2(2200 + random() * 900), description: "Electricity bill", userId: admin.id },
        { pharmacyId, branchId: main.id, categoryId: utilities.id, expenseDate: addDays(day, -7), amount: round2(300 + random() * 150), description: "Water bill", userId: admin.id },
        { pharmacyId, branchId: main.id, categoryId: supplies.id, expenseDate: addDays(day, -12), amount: round2(150 + random() * 400), description: "Receipt paper and bags", userId: admin.id },
      );
      if (month < 2) {
        expenseRows.push(
          { pharmacyId, branchId: silom.id, categoryId: rent.id, expenseDate: day, amount: 12000, description: "Shop rent", userId: admin.id },
          { pharmacyId, branchId: silom.id, categoryId: utilities.id, expenseDate: addDays(day, -5), amount: round2(1500 + random() * 600), description: "Electricity bill", userId: admin.id },
        );
      }
    }
    await tx.insert(expenses).values(expenseRows);

    // Subscription history: the demo pharmacy has paid monthly since it joined.
    const payments: (typeof billingPayments.$inferInsert)[] = [];
    for (let month = 5; month >= 0; month--) {
      payments.push({
        pharmacyId,
        pharmacyName: pharmacy.name,
        planId: multiBranch.id,
        planName: multiBranch.name,
        amount: multiBranch.priceMonthly,
        currency: multiBranch.currency,
        method: month % 2 === 0 ? "transfer" : "cash",
        months: 1,
        periodEnd: daysAgo(month * 30 - 60),
        reference: `DEMO-${6 - month}`,
        recordedBy: platformAdmin.id,
        paidAt: daysAgo(month * 30 + 2),
      });
    }

    // A few more pharmacies (no stock data) so the platform dashboard shows
    // every subscription state. Their admins sign in with the demo password.
    const others = [
      { name: "Sukhumvit Health Pharmacy", plan: multiBranch, status: "active", joined: 65, endsIn: 300, paid: [{ ago: 63, months: 12, method: "transfer" }] },
      { name: "Hat Yai Family Pharmacy", plan: standard, status: "active", joined: 40, endsIn: 5, paid: [{ ago: 38, months: 1, method: "cash" }, { ago: 8, months: 1, method: "cash" }] },
      { name: "Chiang Mai Drugstore", plan: standard, status: "active", joined: 120, endsIn: -6, paid: [{ ago: 118, months: 1, method: "cash" }, { ago: 88, months: 1, method: "transfer" }, { ago: 58, months: 1, method: "cash" }] },
      { name: "Phuket Care Pharmacy", plan: standard, status: "trial", joined: 3, endsIn: 11, paid: [] },
    ] as const;
    for (const [index, other] of others.entries()) {
      const [created] = await tx
        .insert(pharmacies)
        .values({
          name: other.name,
          email: `owner${index + 1}@pharmacy.example`,
          timezone,
          planId: other.plan.id,
          subscriptionStatus: other.status,
          subscriptionEndsAt: daysAgo(-other.endsIn),
          createdAt: daysAgo(other.joined),
        })
        .returning();
      await tx.insert(branches).values({
        pharmacyId: created.id,
        name: created.name,
        createdAt: daysAgo(other.joined),
      });
      await tx.insert(users).values({
        name: `${other.name} Admin`,
        email: `owner${index + 1}@pharmacy.example`,
        passwordHash: await hash(DEMO_ACCOUNTS.admin.password, 10),
        role: "admin",
        pharmacyId: created.id,
        createdAt: daysAgo(other.joined),
      });
      for (const paid of other.paid) {
        payments.push({
          pharmacyId: created.id,
          pharmacyName: created.name,
          planId: other.plan.id,
          planName: other.plan.name,
          amount: paid.months === 12 ? (other.plan.priceYearly ?? 0) : other.plan.priceMonthly,
          currency: other.plan.currency,
          method: paid.method,
          months: paid.months,
          periodEnd: daysAgo(paid.ago - paid.months * 30),
          recordedBy: platformAdmin.id,
          paidAt: daysAgo(paid.ago),
        });
      }
    }
    await tx.insert(billingPayments).values(payments);
  });

  return true;
}

/** A demo stock transfer, taken from `from` earliest expiry first and, with `receive`, added to `to`. */
async function seedTransfer(
  tx: Tx,
  input: {
    pharmacyId: string;
    from: string;
    to: string;
    lines: [productId: string, quantity: number][];
    today: string;
    userId: string;
    sentAt: Date;
    receive: boolean;
  },
) {
  const reference = await nextTransferReference(tx, input.pharmacyId, input.today, input.from);
  const [transfer] = await tx
    .insert(stockTransfers)
    .values({
      pharmacyId: input.pharmacyId,
      reference,
      fromBranchId: input.from,
      toBranchId: input.to,
      status: input.receive ? "received" : "in_transit",
      sentBy: input.userId,
      sentAt: input.sentAt,
      closedBy: input.receive ? input.userId : null,
      closedAt: input.receive ? new Date(input.sentAt.getTime() + 4 * 60 * 60 * 1000) : null,
    })
    .returning();
  for (const [productId, quantity] of input.lines) {
    const taken = await deductStockFefo(tx, {
      pharmacyId: input.pharmacyId,
      branchId: input.from,
      productId,
      quantity,
      today: input.today,
      type: "transfer_out",
      referenceId: transfer.id,
      userId: input.userId,
    });
    for (const part of taken) {
      await tx.insert(stockTransferItems).values({
        transferId: transfer.id,
        productId,
        sourceBatchId: part.batchId,
        batchNumber: part.batchNumber,
        expiryDate: part.expiryDate,
        quantity: part.quantity,
        costPrice: part.costPrice,
      });
      if (input.receive) {
        await addBatch(tx, {
          pharmacyId: input.pharmacyId,
          branchId: input.to,
          productId,
          quantity: part.quantity,
          costPrice: part.costPrice,
          batchNumber: part.batchNumber,
          expiryDate: part.expiryDate,
          type: "transfer_in",
          referenceId: transfer.id,
          userId: input.userId,
        });
      }
    }
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
