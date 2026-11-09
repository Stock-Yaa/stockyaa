const anomalies = {
  title: "Anomaly Detection",
  description: "Automated scanning for unusual patterns in your pharmacy data",
  rescan: "Re-scan",
  total: "Total anomalies",
  high: "High severity",
  medium: "Medium severity",
  low: "Low severity",
  severityHigh: "High",
  severityMedium: "Medium",
  severityLow: "Low",
  affectedItems: "Affected items",
  detected: "Detected: {time}",
  moreItems: "+{count} more",
  itemUnits: "{count} units",
  itemUnitsOne: "1 unit",
  itemSold: "{count} sold",
  itemRefunds: "{count} refunded",
  none: "No anomalies found",
  noneHint: "Nothing unusual in your sales, stock or cash drawer right now.",
  noneFiltered: "No anomalies at this severity",
  showAll: "Show all anomalies",
  // One label, title and body per check.
  expiredStockLabel: "Expired stock",
  expiredStockTitle: "{count} products with expired stock on hand",
  expiredStockTitleOne: "1 product with expired stock on hand",
  expiredStockBody:
    "{units} expired units are still counted as stock. Remove them so they cannot be sold by mistake.",
  soldBelowCostLabel: "Below cost",
  soldBelowCostTitle: "{count} products sold below cost",
  soldBelowCostTitleOne: "1 product sold below cost",
  soldBelowCostBody:
    "Sold for less than their batch cost in the last {days} days, a loss of {amount}.",
  cashShortageLabel: "Cash shortage",
  cashShortageTitle: "{count} cash drawer shifts closed short",
  cashShortageTitleOne: "1 cash drawer shift closed short",
  cashShortageBody:
    "Counted cash was {amount} less than expected in total over the last {days} days.",
  volumeSpikeLabel: "Unusual volume",
  volumeSpikeTitle: "{count} products with unusual volume spikes",
  volumeSpikeTitleOne: "1 product with an unusual volume spike",
  volumeSpikeBody:
    "These products sold more than {factor}× their normal daily volume in the last {days} days.",
  highRefundsLabel: "Refunds",
  highRefundsTitle: "High refund rate",
  highRefundsBody:
    "{count} of {total} sales ({percent}%) in the last {days} days were refunded. Refunds by salesperson are listed below.",
  largeDiscountsLabel: "Discounts",
  largeDiscountsTitle: "{count} sales with large discounts",
  largeDiscountsTitleOne: "1 sale with a large discount",
  largeDiscountsBody:
    "Discounts above {percent}% of the subtotal in the last {days} days, {amount} in total.",
  stockWriteOffsLabel: "Stock loss",
  stockWriteOffsTitle: "{count} products with large stock write-offs",
  stockWriteOffsTitleOne: "1 product with large stock write-offs",
  stockWriteOffsBody:
    "{units} units removed for damage, count corrections or other reasons in the last {days} days. Expiry write-offs are not counted.",
  pricedBelowCostLabel: "Pricing",
  pricedBelowCostTitle: "{count} products priced below cost",
  pricedBelowCostTitleOne: "1 product priced below cost",
  pricedBelowCostBody: "Their sale price is lower than their cost price, so every sale loses money.",
  deadStockLabel: "Dead stock",
  deadStockTitle: "{count} products with no sales in {days} days",
  deadStockTitleOne: "1 product with no sales in {days} days",
  deadStockBody:
    "Still in stock but not sold in the last {days} days, with {amount} tied up at cost.",
};

export default anomalies;
