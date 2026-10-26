const products = {
  title: "Products",
  description: "Medicines and other items you sell.",
  add: "Add product",
  edit: "Edit product",
  searchPlaceholder: "Search by name, generic name or barcode…",
  empty: "No products yet",
  emptyHint: "Add the medicines and items you sell to start tracking stock.",

  // Filters
  filterCategory: "Category",
  filterStatus: "Status",
  allCategories: "All categories",
  uncategorised: "Uncategorised",
  statusActive: "Active",
  statusArchived: "Archived",
  statusAll: "Active and archived",

  // Table
  product: "Product",
  category: "Category",
  salePrice: "Sale price",
  stock: "Stock",
  lowStock: "Low stock",
  outOfStock: "Out of stock",
  rx: "Rx",
  rxHint: "Prescription required",

  // Form
  genericName: "Generic name",
  noCategory: "No category",
  manufacturer: "Manufacturer",
  dosageForm: "Dosage form",
  dosageFormPlaceholder: "Tablet, capsule, syrup…",
  strength: "Strength",
  strengthPlaceholder: "500 mg",
  barcode: "Barcode",
  unit: "Selling unit",
  unitHint: "For example strip, bottle or box.",
  salePriceWithCurrency: "Sale price ({currency})",
  costPriceWithCurrency: "Cost price ({currency})",
  costPriceHint: "Default cost per unit, used to pre-fill purchases.",
  reorderLevel: "Reorder level",
  reorderLevelHint: "Shown as low stock when a branch has this quantity or less.",
  requiresPrescription: "Requires a prescription",
  openingStock: "Opening stock",
  openingStockHint:
    "Optional. Enter what is on the shelf at {branch} now, or leave the quantity blank and add stock later.",
  openingQuantity: "Quantity on hand",
  batchNumber: "Batch number",
  expiryDate: "Expiry date",
  categoryMissing: "This category no longer exists. Choose another one.",
  numberTooLarge: "This number is too large",

  // Archive, restore, delete
  archive: "Archive",
  restore: "Restore",
  archiveTitle: "Archive this product?",
  archiveBody:
    "It will no longer be offered for sale or on new purchases. Its stock and history are kept, and you can restore it at any time.",
  restoreTitle: "Restore this product?",
  restoreBody: "It will be available for sale again.",
  archived: "Product archived",
  restored: "Product restored",
  deleteTitle: "Delete this product?",
  deleteBody:
    "This cannot be undone. Products that have stock, sales or purchases cannot be deleted, only archived.",
  deleteBlocked:
    "This product has stock, sales or purchase history, so it cannot be deleted. Archive it instead.",

  // Categories
  categories: "Categories",
  manageCategories: "Manage categories",
  manageCategoriesHint: "Group products so they are easier to find.",
  categoryName: "Category name",
  newCategoryPlaceholder: "New category name",
  noCategories: "No categories yet",
  categoryProductCount: "Products: {count}",
  categoryExists: "A category with this name already exists",
  renameCategory: "Rename",
  deleteCategoryTitle: "Delete this category?",
  deleteCategoryBody: "Products in this category are kept and become uncategorised.",
};

export default products;
