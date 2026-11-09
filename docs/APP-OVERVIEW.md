# Stockyaa: App Overview

Stockyaa is online pharmacy management software. Many pharmacies use it at the same time, and each one pays a subscription. It is built for Thailand first.

Each pharmacy uses Stockyaa to run its daily work: point of sale, stock with batch and expiry tracking, purchases from suppliers, customers, cash drawer, expenses, reports and AI insights.

---

## 1. Who uses Stockyaa

| Role | Who | What they do |
| --- | --- | --- |
| **Super admin** | The platform owner (one account) | Creates pharmacies, sets up plans and prices, assigns a plan to each pharmacy, records payments and controls access. Does not work inside a pharmacy's sales or stock. |
| **Pharmacy admin** | Owner or manager of one pharmacy | Runs the whole pharmacy: products, stock, sales, purchases, customers, reports, users and settings. On a Multi Branch plan, also manages branches. |
| **Manager** | Branch manager | Works in **one branch** like staff, and also runs its cash drawers: approves pay-outs with their PIN, reviews counts and pay-outs, closes forgotten sessions, sees the drawer history and manages the drawers. Sees the branch's cash and discount alerts. |
| **Staff** | Pharmacist or cashier | Works in **one branch**: point of sale, stock, purchases, customers and the cash drawer. Cannot manage users, branches or AI settings. |

- One email address is one login across the whole platform.
- Each pharmacy's data is completely separate. One pharmacy can never see another's data.

---

## 2. The super admin

There is one super admin for the whole platform. The super admin area (`/superadmin`) has the following sections.

### Dashboard
- Number of pharmacies: active, on trial, suspended, and subscriptions ending soon
- Revenue for the last 12 months, subscription health, payment methods
- Top pharmacies by lifetime revenue, and recent payments

### Pharmacies
- **Create a pharmacy** together with its first admin account (name, email, password).
- Choose its **plan**, its **subscription status** (trial, active, cancelled) and its **end date**.
- Edit the pharmacy's details, suspend or reactivate it, or extend its subscription.
- Manage the pharmacy's users: add another admin, reset passwords, activate or deactivate accounts.
- Delete a pharmacy permanently. The pharmacy's name must be typed to confirm.

### Plans
- Create and edit plans: name, description, monthly price, optional yearly price, currency, display order.
- Choose each plan's **type**: Standard or Multi Branch (see section 3).
- Deactivate a plan to stop offering it. A plan that pharmacies are using cannot be deleted.

### Payments
- Record a **cash or bank transfer payment** for a pharmacy (1, 3, 6 or 12 months). The subscription is extended and the pharmacy becomes active.
- Full payment history across all pharmacies.

### Stripe
- Online card payments through Stripe are planned. For now, the page shows that Stripe is not connected, and payments are recorded by hand.

### My account
- The super admin's own name, email and password.

---

## 3. Plans

Every plan has one of two types.

| | **Standard** | **Multi Branch** |
| --- | :---: | :---: |
| Branches | **1** | Several (the super admin sets the maximum, at least 2) |
| Pharmacy admins | **1** | Any number |
| Staff users | Unlimited | Unlimited |
| Add new branches | ❌ No | ✅ Yes, up to the plan's limit |
| Branches page | Hidden | ✅ |
| Stock by branch | Hidden | ✅ |
| Stock transfers between branches | Hidden | ✅ |
| Switch between branches in the top bar | — | ✅ (admins) |
| All other features (section 5) | ✅ | ✅ |

**Only a Multi Branch plan can add branches.** A pharmacy admin on a Standard plan does not see the Branches page or any option to add a branch. The system also refuses a new branch if one is attempted.

**Standard has one admin.** The admin can still create as many staff users as needed, but the "Admin" role cannot be given to anyone else while the one admin seat is taken. (The super admin can still add an extra admin to any pharmacy from the super admin area.)

A pharmacy with no plan follows the Standard rules.

### Changing plans
- **Standard → Multi Branch:** the branch features appear immediately. The admin can add branches up to the new plan's limit and create more admins.
- **Multi Branch → Standard:** nothing is deleted. If the pharmacy still has several active branches, it keeps seeing the branch pages so its admin can close the extra ones, but it cannot add or reopen branches. Admins it already has stay. No new admin can be added or reactivated.

### Subscription and access
- A subscription is **trial**, **active** or **cancelled**, and has an end date (or none).
- When a subscription ends, or the super admin suspends the pharmacy, its users can still sign in but only see the **Subscription** page until access is renewed.
- The **Subscription** page shows the current plan, status, end date, how many branches are in use, and all plans on offer.
- Users get a notification when the subscription is about to end.

---

## 4. Branches (Multi Branch plan only)

- **Shared across the whole pharmacy:** products, prices, categories, suppliers, customers and settings.
- **Kept separately for each branch:** stock, sales, purchases and the cash drawer.
- **Admins** work in every branch and switch branches from the top bar. **Staff** are assigned to one branch and work only there.
- Branches are never deleted, only deactivated, so their history is kept. A branch cannot be deactivated while staff still work in it, its cash drawer is open, or stock transfers to or from it are still on the way.
- **Stock transfers** move stock from one branch to another: the stock leaves when the transfer is sent and arrives when the other branch receives it. A transfer that is still on its way can be cancelled, and the stock goes back.
- **Stock by branch** shows how much of each product every branch holds.
- The dashboard and reports can show one branch or all branches together.

---

## 5. Pharmacy features

### Dashboard
Today's sales, sales trend, sales by hour, payment methods, best sellers of the last 7 days, recent sales, stock that needs attention (low stock, expiring batches), business snapshot and shortcuts. On a Multi Branch plan it also compares branches.

### Point of sale
- Search products or **scan a barcode**.
- Cart with quantities and **discounts**. Prices **include VAT**: a VAT-registered pharmacy (Settings) shows the VAT inside each sale; otherwise there is no VAT. A discount on top of a member or staff price is allowed and **flagged to the manager**.
- Attach a customer, or add a new customer straight from the till. The customer's **price level** sets the prices: Regular, Member or Staff (see Products).
- **Prescription-only** medicines are flagged with a reminder to check the prescription.
- Payment by **cash, card or bank transfer**.
- **Printable receipt** (80 mm printer) with the pharmacy's details and its own footer text. For a VAT-registered pharmacy it is an **abbreviated tax invoice** (ใบกำกับภาษีอย่างย่อ) with the VAT included.
- **Full tax receipts** (ใบกำกับภาษีเต็มรูป): at the POS when the customer asks, or later from the sale in Sales History. Only for a VAT-registered pharmacy, and from Sales History up to **7 days** after the purchase. The buyer's name, 13-digit tax ID (or **passport number** for a foreign buyer), address and branch are filled in from the customer when known (and can be saved to them). The A4 document is printed in Thai and English as an **original and a copy** (ต้นฉบับ / สำเนา), with VAT shown separately and the amount in Thai words. Tax receipts have their own running numbers (e.g. TAX-202611001); each branch has a tax branch number (00000 = head office). Refunding a sale with a tax receipt issues a **credit note** (ใบลดหนี้) that cancels it.
- **Document numbers** in the pharmacy's own format (Settings): invoices, tax receipts, credit notes, purchase orders and transfers each have a prefix, with a shared optional date part (e.g. YYYYMM, Western or Buddhist year) and number of digits, e.g. INV-202611001. With a date part, the number restarts at 1 each month (or year or day). Optionally **each branch has its own numbers**, with its code after the prefix (INV-SKV-202611001).
- Stock is taken **first-expired, first-out**, and expired batches are never sold.

### Sales
Full sales history with receipts. A sale can be **refunded**, which returns its stock.

### Customers
- Customer list with each customer's full purchase history.
- Each customer has a **price level**: Regular, Member or Staff. Staff who buy for themselves are added as customers with the Staff level.
- **Customer insights:** new customers, VIP customers (top spenders), and customers at risk (no purchase for a long time).
- **Refill reminders:** reminders for a customer's regular medicine, with due dates. Each new sale of that medicine to the customer moves the reminder forward automatically.

### Products
Medicines and other items with categories, cost price, barcode, reorder level and a prescription-only flag. Each product can have **several photos**, one of them the main photo shown in the product list and on the POS tiles. Each product has **three selling prices**: Regular, Member and Staff. The Member and Staff price can each be entered as a **price** or as a **% off the regular price** (which follows the regular price when it changes); the form shows the price it comes to. A blank Member or Staff price uses the rule in Settings, or the Regular price. Bulk import has columns for all three. Products can be archived and restored.

### Stock
- Stock by **batch**, with batch number and **expiry date**.
- Manual stock adjustments with a reason.
- **Stock alerts:** products to reorder, and batches that are expiring or have expired.
- **Stock movements:** every change to stock (sales, refunds, purchases, adjustments, transfers), with who made it and when.
- **Bulk import:** add many products at once from a public drug catalogue (openFDA and RxNorm) or from your own CSV file.

### Purchases and suppliers
- Purchase orders to suppliers. An order can be saved and received later, or received straight away.
- Receiving an order adds every item to stock as a batch with its batch number and expiry date.
- A supplier directory.

### Cash drawer
- A branch can have **several drawers** (e.g. front counter and consult desk); each till chooses which one it uses. Every cash sale and refund is tied to that drawer's open session.
- Staff open a shift by picking their name, entering their **PIN** and counting the float note by note (**blind count**: the target is not shown). If the count differs from what the last session left, the manager is told. There is no fixed float: whatever the last session left in the drawer is what the next one counts. A shift can be **handed over**: the incoming person recounts blind with their own PIN.
- During the shift, from the cash drawer page or the bar above the POS: **pay-in** (e.g. float top-up from the safe), **pay-out** (petty cost, with a **receipt photo**, booked as an **expense** in the chosen expense category; above the approval limit a manager enters their PIN or it goes for approval; a rejected pay-out stays on the record of the person who paid it out), **cash drop** to the safe (notes counted, bag number) and **no-sale** (drawer opened without a sale, with a reason).
- Closing is a **blind count**; the expected amount appears only after it is submitted. A small difference needs a reason; a larger one allows a recount and then goes to the manager; above the large limit the manager is notified and the drawer stays **blocked** until they decide. Taking cash to the safe at closing is optional (with a bag number); what stays is counted by the next shift. A **Z-slip** is printed on the 80 mm receipt printer.
- Managers (in their branch) and admins (across all branches) have a **review queue** (differences, opening mismatches, large pay-outs, forgotten sessions they can force-close, staff who are often short, and rejected pay-outs per person), the **session history** with filters and CSV export, and the drawer list. The limits (small and large difference, pay-out approval limit, recounts) are set in Settings, and PINs in Users or on each person's profile.

### Expenses
Record business expenses by category, filter them, and see them in reports.

### Reports
Revenue, profit, daily revenue and number of sales, payment methods, revenue by category, best sellers, stock value and stock at risk, and expenses. Reports can be **exported to Excel or CSV**, or printed.

### AI tools
| Tool | What it does |
| --- | --- |
| **AI Assistant** | Answers questions about your own data, for example: "What was my best seller this month?", "Show me low stock items", "What is my profit margin?", "Which customers haven't visited recently?" |
| **Demand forecasts** | Predicts demand from recent sales and lists the products most at risk of running out. |
| **Anomaly detection** | Flags unusual activity: expired stock still on the shelf, sales below cost, cash drawer shortages, sudden volume spikes, high refunds, large discounts and large stock write-offs. |
| **AI Analytics** | Inventory predictions with reorder suggestions, and expiry management (which batches will not sell before they expire). |
| **AI configuration** (admin) | Turn AI features on or off and save an OpenAI API key. |

Planned AI features, not yet available: drug interaction checker, product search by symptom, reading prescriptions from a photo, and generic substitution suggestions.

### Notifications
Automatic alerts for out-of-stock and low-stock products, expired and expiring batches, and subscription changes.

### Users (admin)
- Add users as **staff** (assigned to one branch) or **admin** (all branches; only one admin on a Standard plan).
- Edit users, reset their passwords, and activate or deactivate them.
- A pharmacy always keeps at least one active admin.

### Settings and profile
- **Pharmacy profile:** name, contact details, licence number, tax ID, currency, time zone, VAT registered (and the VAT rate), member and staff price rules (% off the regular price for products without their own price), expiry alert period, receipt footer.
- **My profile:** each user's own name, email and password. Changing a password signs out the user's other sessions.

---

## 6. For every user

- **English and Thai:** every screen, message and receipt is in both languages. Switch with the EN / ไทย control in the top bar.
- **Dark mode** on every screen, remembered per browser.
- Works on **phone, tablet and desktop**.
- Dates, "today" and daily reports follow the **pharmacy's own time zone**.
- **Everything is traceable:** every sale, refund, purchase and stock change records who did it and when.
