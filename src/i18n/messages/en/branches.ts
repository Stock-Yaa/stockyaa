const branches = {
  // Header switcher
  current: "Branch",
  switchBranch: "Switch branch",
  switched: "Now working in {name}",
  allBranches: "All branches",
  changedElsewhere: "The branch was switched in another tab. Reload this page and try again.",

  // Branches page (admins)
  title: "Branches",
  description:
    "The locations of your pharmacy. Products and prices are shared; stock, sales and the cash drawer are kept per branch.",
  add: "Add branch",
  edit: "Edit branch",
  usage: "{used} of {limit} branches on your plan",
  limitReached: "Your plan includes {limit} branches. Upgrade your plan to add more.",
  limitReachedOne: "Your plan includes 1 branch. Upgrade your plan to add more.",
  viewPlan: "View plan",
  nameTaken: "A branch with this name already exists.",
  colStaff: "Staff",
  colStockValue: "Stock value",
  currentBadge: "Current",
  deactivate: "Deactivate",
  activate: "Activate",
  deactivateTitle: "Deactivate this branch?",
  deactivateBody:
    "Nobody can work in this branch until it is activated again. Its stock, sales and history are kept.",
  activateTitle: "Activate this branch?",
  activateBody: "The branch counts towards the number of branches your plan includes.",
  deactivated: "Branch deactivated",
  activated: "Branch activated",
  lastActive: "A pharmacy needs at least one active branch.",
  hasStaff: "Move the staff of this branch to another branch, or deactivate them, first.",
  hasOpenShift: "Close this branch's open cash drawer shift first.",
  hasTransfers: "Receive or cancel the stock transfers in transit to or from this branch first.",

  // Staff member without a working branch
  noBranchTitle: "No branch assigned",
  noBranchBody:
    "Your account is not assigned to an active branch. Ask your pharmacy admin to assign you to one.",
};

export default branches;
