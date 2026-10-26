# Stockyaa: Product Plan

Stockyaa is pharmacy management software sold as a monthly or yearly subscription to many pharmacies (multi-tenant SaaS). It is modelled on [PharmacyNext](https://codecanyon.net/item/pharmacynext-modern-pharmacy-pos-management-system/57668356) and aimed first at the Thai market.

**In short:** we run the platform as the **super admin**. We add pharmacies and each one pays a subscription through **Stripe**. Each pharmacy's own admin then runs the whole pharmacy in Stockyaa: products, stock with batch and expiry tracking, purchases from suppliers, point of sale, customers and reports. When a pharmacy stops paying, its access ends automatically at the end of the period it paid for.

Contents:

1. [Who uses the system](#1-who-uses-the-system)
2. [Platform principles](#2-platform-principles)
3. [Super admin](#3-super-admin)
4. [Subscriptions and billing with Stripe](#4-subscriptions-and-billing-with-stripe)
5. [Pharmacy features](#5-pharmacy-features)
6. [Technology](#6-technology)
7. [Open questions](#7-open-questions)

---

## 1. Who uses the system

| Role | Who | What they can do |
| --- | --- | --- |
| **Super admin** | Us, the platform owner | Add and manage pharmacies, set plans and prices, see all subscriptions and payments, suspend or delete a pharmacy. Does not work inside a pharmacy's sales or stock screens. |
| **Pharmacy admin** | Owner or manager of one pharmacy | Everything inside their own pharmacy: products, stock, purchases, sales, customers, reports, settings, staff and billing. |
| **Staff** | Pharmacist or cashier | Only the parts of their pharmacy the pharmacy admin allows, for example point of sale only. |

Each user belongs to exactly one pharmacy; the super admin belongs to none. One email address is one login across the whole platform.

---

## 2. Platform principles

- **Each pharmacy's data is completely separate.** Every query is limited to the signed-in user's pharmacy, so one pharmacy can never see or change another's data, even by guessing a record ID.
- **English and Thai.** Every screen, message, receipt and export exists in both languages. Each user switches with an EN / ไทย control.
- **Dark mode** on every screen, remembered per browser.
- **Works on phone, tablet and desktop.**
- **Per-pharmacy settings for currency, time zone and tax rate.** The defaults are Thai baht, Bangkok time and 0% tax (Thai VAT is 7%, so each pharmacy sets its own rate). "Today", daily reports and expiry checks all follow the pharmacy's own time zone.
- **Access follows the subscription.** A pharmacy whose subscription has ended, or which has been suspended, can still sign in. It sees only its Subscription page until it renews.
- **Everything is traceable.** Every sale, refund, purchase and stock change records who did it and when.

---

## 3. Super admin

### 3.1 Platform dashboard

- Total pharmacies, active, suspended, expiring soon
- Monthly recurring revenue (MRR) and revenue by month
- Recent payments and failed payments
- Recently added pharmacies
- Subscriptions ending soon or already ended
- Health of the Stripe connection (last webhook received, failures)

### 3.2 Pharmacies

- List with search and filters (active, trial, past due, expired, suspended, cancelled)
- Add a pharmacy together with its first admin login in one step
- Choose how the new pharmacy pays:
  - **Stripe:** send the pharmacy a payment link
  - **Cash or bank transfer:** record the payment by hand
- Edit pharmacy details: name, contact, licence number, currency, time zone
- See and change the plan, subscription status and paid-until date
- Quick extend: +1 month, +1 year
- Suspend and reactivate (locks the users out but keeps all data)
- Users: add admin, reset password, activate or deactivate (each takes effect immediately)
- Usage: number of products, sales and users
- Payment history for the pharmacy
- Permanent delete, confirmed by typing the pharmacy's name
- A protected demo pharmacy that cannot be deleted by accident

### 3.3 Plans

Each plan has:

- Name and description
- Monthly price and yearly price, in a chosen currency
- The matching Stripe prices, created from the super admin screen so nothing has to be copied by hand
- Optional limits, for example maximum number of users
- Active or inactive, and the order plans are listed in

A plan that pharmacies are using cannot be deleted, only deactivated.

### 3.4 Payments and audit

- **All payments** across all pharmacies: date, pharmacy, plan, amount, method (Stripe or manual), status, and a link to the Stripe invoice
- **Record a manual payment** (cash or bank transfer) with amount, reference and note. Recording it extends the subscription.
- **Audit log** of sensitive actions: manual payments, suspensions, deletions, password resets. Each entry shows who did it and when.
- **Stripe settings:** test or live mode, connection check, webhook status

---

## 4. Subscriptions and billing with Stripe

### 4.1 Goals

1. A pharmacy pays by card and gets access straight away.
2. Renewals happen automatically every month or year.
3. When payment stops, access ends on its own at the end of the paid period. Nobody on our side has to do anything.
4. Pharmacies that cannot or will not pay by card can still pay by cash or bank transfer.

### 4.2 What we use from Stripe

| Stripe feature | What it does for us |
| --- | --- |
| **Products and Prices** | One Stripe product per plan, with a monthly and a yearly price |
| **Checkout** | Stripe-hosted payment page. We never handle card numbers. |
| **Customer Portal** | Lets the pharmacy admin update their card, download invoices, switch plan or cancel |
| **Webhooks** | Stripe tells our server when a payment succeeds or fails and when a subscription changes. This keeps access in sync. |
| **Smart Retries** | Stripe retries failed card payments automatically before giving up |

Stripe is available to Thai businesses and pays out in baht to a Thai bank account. Cards support automatic renewal. We still need to confirm whether PromptPay can be used for renewals (see [open questions](#7-open-questions)).

### 4.3 Subscription states

| Status | Meaning | Has access? |
| --- | --- | --- |
| **Trial** | Free trial, no payment yet | Yes, until the trial ends |
| **Active** | Paid and current | Yes, until the paid-until date |
| **Past due** | The latest renewal payment failed and Stripe is retrying | Yes, during a short grace period, with a warning banner |
| **Cancelled** | Cancelled by the pharmacy, or after Stripe's retries ran out | No, once the paid period has ended |
| **Suspended** | Locked by the super admin, regardless of payment | No |

### 4.4 How access expires automatically

Each pharmacy has a stored **paid-until date**, and every successful payment moves it forward. Access needs that date to keep moving. Ending access needs no action: if no payment arrives, the date simply passes.

```
Pharmacy pays             Stripe sends              Our server sets
(first time or renewal)   "invoice paid"    ──►     paid-until = end of the new billing period
                                                            │
                                    on every page load ◄────┘  is today before paid-until + grace?
                                                            │
                  no payment arrives ──► the date passes ──► access ends automatically
                                                             (the pharmacy is sent to the renewal page)
```

Why this is reliable:

- **If a message from Stripe is lost,** the worst case is that access ends on the old date. A daily check with Stripe then corrects it. A pharmacy can never keep access it has not paid for.
- **A short grace period** (for example 3 days) covers bank delays and Stripe's retries. A pharmacy is not locked out in the middle of a working day because a renewal ran a few hours late.
- **Cash payments use the same date.** Recording a one-year cash payment sets paid-until one year ahead.

### 4.5 How each situation works

**New pharmacy paying by card**

1. The super admin adds the pharmacy and its admin login, then picks a plan and Stripe.
2. The system creates a Stripe payment link. The super admin sends it, or the pharmacy admin opens it from the Subscription page after first signing in.
3. The pharmacy pays on Stripe's page.
4. Stripe notifies our server, which marks the pharmacy active until the end of the first period.

**Free trial**

The pharmacy starts on a trial with an end date, for example 14 days. It pays through the same Stripe page before the trial ends. If it does not pay, access ends on the trial end date.

**Automatic renewal**

Stripe charges the saved card at the end of each period, and the paid-until date moves forward. Nobody has to do anything.

**Renewal payment fails**

1. The pharmacy becomes past due and sees a banner asking them to update their card. An email reminder is sent as well.
2. Stripe retries over the next few days.
3. If a retry succeeds, the pharmacy is active again.
4. If every retry fails, Stripe cancels the subscription, and access ends after the paid period and grace period.

**Pharmacy cancels**

The pharmacy cancels from the Customer Portal. Access continues until the end of the period it has paid for, then stops. Until then the Subscription page shows "Ends on …".

**Upgrade, downgrade, or switch between monthly and yearly**

The pharmacy does this in the Customer Portal. Stripe adjusts the charge, and our server updates the plan.

**Expired pharmacy renews**

1. The pharmacy admin signs in and lands on the Subscription page; every other page redirects there.
2. They click Renew and pay.
3. Access returns within seconds.

**Cash or bank transfer**

The super admin records the payment. The paid-until date moves forward, and the payment appears in the history together with the name of whoever recorded it.

**Super admin suspends a pharmacy**

Suspension overrides everything else. Stripe billing is paused at the same time, so the pharmacy is not charged while it is locked out.

### 4.6 Notifications

Emails go out in the pharmacy admin's language (English or Thai), and the same messages appear as banners inside the app.

| When | To | Message |
| --- | --- | --- |
| Trial ends in 3 days | Pharmacy admin | Trial ending, link to pay |
| Yearly renewal in 7 days | Pharmacy admin | Upcoming charge |
| Payment succeeded | Pharmacy admin | Receipt |
| Payment failed | Pharmacy admin | Update your card, with a link |
| Access ended | Pharmacy admin | Renew link |
| Failed payments and cancellations | Super admin | Daily summary |

### 4.7 Behind the scenes

- **Webhook endpoint** that listens for these Stripe events: checkout completed, invoice paid, invoice payment failed, subscription updated, subscription deleted.
  - Every message's Stripe signature is verified.
  - Each event is processed only once, so a resent message changes nothing.
  - Events are handled correctly even when they arrive out of order.
- **A daily job** that checks every subscription against Stripe and fixes anything a lost message left wrong. The same job sends the reminder emails.
- **Data kept for billing:**
  - On each plan: its Stripe prices.
  - On each pharmacy: its Stripe customer and subscription, billing interval and paid-until date.
  - A **payments** table and a **Stripe events** log.

---

## 5. Pharmacy features

### 5.1 Dashboard

- Sales today and this month
- Profit and expenses today
- Products running low
- Batches expiring soon, and expired stock still on the shelves
- Sales chart for recent days
- Recent sales and best sellers
- Cash drawer status

### 5.2 Products

- Product details:
  - name and generic name
  - category, manufacturer, dosage form and strength
  - barcode and unit
  - sale price and default cost
  - reorder level and a "prescription required" flag
- Thai FDA registration number (เลขทะเบียนยา) and drug classification
- Opening stock (quantity, batch, expiry) entered when a product is created
- Search by name, generic name or barcode; filter by category
- Stock level with "low stock" and "out of stock" badges
- Categories
- Archive a product instead of deleting it once it has history
- Bulk import from CSV or Excel, with a preview and an error report

### 5.3 Stock, batches and expiry

How stock works:

- **Stock is held in batches.** Each batch has a batch (lot) number, expiry date, quantity and cost price. A product's stock is the total of its batches.
- **First expired, first out (FEFO).** Each sale takes stock from the batch that expires first.
- **Expired batches are never sold.** They stay visible in stock until written off.
- **Every change is recorded** in a stock movement history: opening stock, purchase, sale, refund and adjustment, each with who made it and why.

Features:

- Stock list by batch, with "expired" and "expiring soon" badges
- Filters: in stock, low stock, expiring soon, expired, empty
- Summary: stock value at cost, low-stock count, expiring and expired batches
- "Expiring soon" window set per pharmacy (default 90 days)
- Add stock outside a purchase
- Adjust a batch with a reason: damaged, expired write-off, count correction, other
- Stocktake: count the shelves, review the differences, then post all adjustments at once
- Return expired stock to the supplier
- Stock movement history

### 5.4 Suppliers

- Supplier details: name, contact person, phone, email, address, tax ID, notes
- Amount owed to each supplier, and payments made to them

### 5.5 Purchases

- Purchase orders with supplier, supplier invoice number and line items (product, quantity, cost, batch, expiry)
- Cost filled in automatically from the product
- Save as an order, or save and receive immediately
- Receive in full or in part; received stock becomes new batches
- Cancel orders that have not been received
- Return items to a supplier
- Attach the supplier's invoice (photo or PDF)

### 5.6 Point of sale

- Search by name, generic name or barcode; works with a USB barcode scanner
- Category shortcuts; product tiles showing price, stock and an "Rx" badge
- Cart that cannot exceed the stock available to sell
- Optional customer (walk-in by default)
- Discount, and tax from the pharmacy's tax rate
- Payment by cash (with change), card, bank transfer or PromptPay QR, or a split across methods
- Hold a sale and resume it later
- Warning when the cart contains prescription-only medicine, with prescription details recorded (doctor, prescription number, photo)
- Prices and totals always calculated on the server, so they cannot be changed in the browser
- Invoice numbers for each pharmacy (INV-000001 …)
- Receipts for 80 mm thermal printers and for A4

### 5.7 Sales and returns

- Sales history with search, status and date filters, and totals for the period
- Receipt view and reprint
- Full and partial returns with a reason; returned items go back into the batches they came from

### 5.8 Customers

- Customer details: name, phone, email, address, notes
- Customer page: total spent, number of visits, last visit, purchase history
- Allergy and regular-medication notes, shown at the point of sale
- Loyalty points: earn per baht spent, redeem at the point of sale
- Customer credit (pay later), and payments against it

### 5.9 Reports

- Any date range, with quick presets
- Revenue, gross profit and margin, average sale, units sold, discounts, refunds
- Sales by day, best-selling products, sales by payment method, sales by staff member
- Expenses and net profit
- Stock value; expiring and expired stock value; stock value by category
- Dead stock (no sales in a set number of days); purchases by supplier
- Export to CSV and Excel (Thai text included)

### 5.10 Expenses

- Expense categories (rent, salaries, utilities, …)
- Each expense records date, amount, category, note and a receipt photo
- Expenses are included in the profit reports

### 5.11 Cash drawer

- Open a shift with a starting cash amount
- Track cash sales, refunds, pay-ins and pay-outs during the shift
- Close the shift with a counted amount and see whether the drawer is over or short
- Shift report per cashier

### 5.12 Staff and permissions

- The pharmacy admin adds staff logins for their own pharmacy
- Roles: **admin** (everything) and **staff** (configurable)
- Permissions per staff member:
  - selling and refunds
  - products and stock adjustments
  - purchases
  - reports and exports
  - customers
  - cash drawer

### 5.13 Settings

- Pharmacy profile: name, phone, email, address, licence number, tax ID, logo
- Currency, time zone, tax rate, "expiring soon" window
- Receipt: footer text and template options; Thai full tax invoice (ใบกำกับภาษีเต็มรูป)
- Loyalty settings
- My account: name, password (changing it signs out other devices), forgot password by email

### 5.14 Subscription (inside a pharmacy)

- Current plan and price, status, valid-until date and days left
- Pay or renew (Stripe Checkout)
- Manage billing (Stripe Customer Portal): card, invoices, plan change, cancellation
- Payment history
- Clear notice when access is paused, and how to restore it

### 5.15 AI features

- Read a prescription photo: extract the medicines and doses, match them to products, add them to the cart
- Drug interaction warnings at the point of sale
- Demand forecasts and reorder suggestions per product
- Margin suggestions; alerts for dead stock and unusual returns
- An assistant that answers questions about the pharmacy's own data
- Each pharmacy can use its own AI provider key

---

## 6. Technology

| Part | Choice |
| --- | --- |
| App | Next.js 16 with React 19 and TypeScript |
| Design | Tailwind CSS with light and dark themes; one font covering Thai and Latin text |
| Database | PostgreSQL on **Supabase**, accessed through Drizzle ORM, with versioned migrations |
| Sign-in | Email and password; passwords hashed with bcrypt; signed session cookies |
| Payments | Stripe Checkout, Customer Portal and webhooks |
| Email | Transactional email provider (to be chosen) |
| Hosting | Vercel |



---

