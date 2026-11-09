const bulkImport = {
  description:
    "Add many products at once: pick them from a public drug catalogue or upload your own CSV file.",

  // Mode choice
  modeWeb: "Import from the web",
  modeWebHint:
    "Best for common medicines. Look one up and the name, generic name, maker and prescription flag are filled in; you set the price.",
  modeCsv: "Import a CSV file",
  modeCsvHint:
    "Best for many local or generic products at once. Download the template, fill in the columns and upload the file.",

  // Import from the web
  poweredBy:
    "Uses the free openFDA and RxNorm drug catalogues. Their listings are from the US, so check each product before importing.",
  searchAndPick: "Search & pick",
  bulkAdd: "Bulk add",
  searchPlaceholder: "Brand name, generic name or ingredient…",
  search: "Search",
  tabResults: "Search results",
  tabBrowse: "Browse by category",
  typeToSearch: "Type a medicine name above to search the catalogue.",
  searching: "Searching…",
  noMatches: "No matches for “{query}”.",
  didYouMean: "Did you mean {name}?",
  chooseClass: "Choose a category to see medicines in it.",
  add: "Add",
  added: "Added",
  addAll: "Add all",
  classPainRelief: "Pain & inflammation (NSAIDs)",
  classAntibiotics: "Antibiotics (penicillins)",
  classMacrolides: "Antibiotics (macrolides)",
  classAntihistamines: "Allergy (antihistamines)",
  classAntacids: "Stomach acid (PPIs)",
  classDiabetes: "Diabetes (metformin)",
  classCholesterol: "Cholesterol (statins)",
  classBloodPressure: "Blood pressure (ARBs)",
  classCalciumChannel: "Blood pressure (calcium channel blockers)",
  classSteroids: "Corticosteroids",
  classAntidepressants: "Antidepressants (SSRIs)",
  bulkHint: "One medicine per line, up to {max}. Each line is matched to the closest catalogue entry.",
  bulkPlaceholder: "Amoxicillin 500\nParacetamol\nCetirizine 10 mg",
  findAndAdd: "Find and add",
  bulkAdded: "Added to the queue: {count}",
  bulkNotFound: "Not found: {names}",
  bulkEmpty: "Enter at least one medicine name.",
  bulkTooMany: "Enter at most {max} names at a time.",
  catalogUnavailable: "The drug catalogue could not be reached. Try again in a moment.",

  // Import a CSV file
  csvStep1: "Download the template",
  csvStep1Hint:
    "Open it in Excel or Google Sheets and fill in one product per row. Only name and sale_price are required.",
  downloadTemplate: "Download template",
  csvStep2: "Upload the file",
  csvStep2Hint:
    "Save it as CSV (UTF-8). Dates can be YYYY-MM-DD or DD/MM/YYYY; Buddhist years are converted.",
  dropFile: "Drop a CSV file here, or click to choose one",
  csvLoaded: "Rows added to the queue from {file}: {count}",
  csvNoName: "This file has no name column. Use the column names from the template.",
  csvEmpty: "This file has no product rows.",
  csvNotCsv: "Choose a .csv file. In Excel, use Save As and pick CSV UTF-8.",
  csvUnknownColumns: "Ignored columns: {columns}",
  csvTooMany: "Only the first {max} rows were added.",
  csvColumns: "Columns",

  // Queue
  queueTitle: "Ready to import",
  queueHint: "Check each product and set its price. Nothing is saved until you import.",
  queueEmpty: "Nothing in your import queue yet",
  queueEmptyHint: "Pick medicines from the catalogue or upload a CSV file and they appear here.",
  queueCount: "Products: {count}",
  queueFull: "The queue holds at most {max} products. Import these first.",
  clearQueue: "Clear all",
  remove: "Remove",
  importButton: "Import all ({count})",
  importing: "Importing…",
  viewProducts: "View products",

  // Results
  imported: "Products imported: {count}",
  fixRows: "Fix the highlighted products ({count}) first. Nothing has been imported yet.",
  tooManyRows: "Import at most {max} products at a time.",
  nothingToImport: "Add products to the queue first.",
  duplicateProduct: "Already in your products, or listed twice here",
  duplicateBarcode: "This barcode is already used, or listed twice here",
  unclearPrescription: "Not clear: write yes or no. Tick or clear the box to confirm.",
};

export default bulkImport;
