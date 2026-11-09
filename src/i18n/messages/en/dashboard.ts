const dashboard = {
  title: "Dashboard",
  description: "How the pharmacy is doing today.",
  welcome: "Welcome back, {name}",
  byBranchTitle: "Branches this month",
  byBranchRevenue: "Revenue",
  byBranchSales: "Sales",
  byBranchProfit: "Gross profit",
  byBranchStock: "Stock value",
  byBranchExpired: "Expired batches",
  newSale: "Open POS",
  viewAll: "View all",

  // Today, in the header
  today: "Sales today",
  vsSameTimeYesterday: "vs same time yesterday",
  noYesterdayComparison: "No sales yesterday by this time",
  transactions: "Transactions",
  unitsSold: "{count} units sold",
  unitsSoldOne: "1 unit sold",
  grossProfit: "Gross profit",
  margin: "{percent}% margin",
  averageSale: "Average sale",
  customersToday: "{count} named customers",

  // Attention banner
  attentionTitle: "Stock needs attention",
  attentionExpired: "{count} expired batches still on the shelves ({value} at cost)",
  attentionOut: "{count} products out of stock",
  attentionOutOne: "1 product out of stock",
  attentionAction: "Review stock",

  // Business snapshot
  snapshotTitle: "Business snapshot",
  yesterday: "Yesterday",
  yesterdayHint: "{count} sales, full day",
  yesterdayHintOne: "1 sale, full day",
  taxMonth: "Tax this month",
  taxMonthHint: "Collected on sales",
  profitMonth: "Gross profit this month",
  refundsMonth: "Refunds this month",
  refundsMonthHint: "{count} refunded sales",
  refundsMonthHintOne: "1 refunded sale",
  customers: "Customers",
  customersHint: "On file",
  newCustomers: "New customers",
  newCustomersHint: "Added this month",
  openPurchases: "Open purchase orders",
  openPurchasesHint: "{amount} awaiting delivery",
  activeProducts: "Active products",
  activeProductsHint: "{count} units in stock",
  activeProductsHintOne: "1 unit in stock",

  // Revenue and value
  revenueTitle: "Revenue and value",
  yearToDate: "Year to date",
  yearToDateHint: "Since {date}",
  thisMonth: "This month",
  vsLastMonth: "vs same days last month",
  monthHint: "{count} sales",
  monthHintOne: "1 sale",
  last7Days: "Last 7 days",
  last7DaysHint: "{count} sales",
  last7DaysHintOne: "1 sale",
  stockRetailValue: "Stock value at retail",
  stockRetailValueHint: "{amount} at cost",

  // Stock chips
  lowStock: "Low stock",
  expiringWithin: "Expiring within {days} days",
  expiredBatches: "Expired batches",

  // Charts
  salesChartTitle: "Sales trend",
  salesChartHint: "Completed sales, last 14 days",
  revenue: "Revenue",
  salesCount: "Sales",
  fullReports: "Full reports",
  paymentTitle: "Payment methods today",
  paymentHint: "By revenue",
  paymentEmpty: "No sales yet today.",
  hourlyTitle: "Today's sales by hour",
  hourlyHint: "Revenue per hour, {timezone} time. Useful for planning staff.",
  hourlyEmpty: "No sales yet today.",

  // Best sellers
  topProductsTitle: "Best sellers, last 7 days",
  topProductsHint: "By revenue",
  topProductsEmpty: "No sales in the last 7 days.",
  rank: "#",
  product: "Product",
  quantity: "Qty",

  shortcutsTitle: "Shortcuts",

  // Recent sales
  recentSalesTitle: "Recent sales",
  recentSalesEmpty: "No sales yet. Open the point of sale to make the first one.",
  itemLine: "{quantity}× {name}",
  moreItems: "+{count} more",
  walkIn: "Walk-in customer",
  refunded: "Refunded",

  // Stock and expiry
  stockExpiryTitle: "Stock and expiry",
  stockExpiryEmpty: "Nothing is running low or close to expiry.",
  stockLine: "In stock {quantity} · reorder at {level}",
  inStock: "{quantity} left",
  lowBadge: "Low",
  outBadge: "Out of stock",
  expiredBadge: "Expired",
  expiringBadge: "Expiring",
  expiresOn: "Expires {date}",
  expiredOn: "Expired {date}",
  batch: "Batch {number}",
  noBatchNumber: "No batch number",
};

export default dashboard;
