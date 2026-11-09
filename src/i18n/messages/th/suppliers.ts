import type en from "../en/suppliers";

const suppliers: typeof en = {
  title: "ผู้จำหน่าย",
  description: "บริษัทที่คุณสั่งซื้อสินค้า",
  add: "เพิ่มผู้จำหน่าย",
  edit: "แก้ไขผู้จำหน่าย",
  searchPlaceholder: "ค้นหาด้วยชื่อ ผู้ติดต่อ หรือเบอร์โทร…",
  contactPerson: "ผู้ติดต่อ",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  empty: "ยังไม่มีผู้จำหน่าย",
  emptyHint: "เพิ่มบริษัทที่คุณสั่งซื้อยา",
  deleteBody: "ลบได้เฉพาะผู้จำหน่ายที่ยังไม่มีรายการสั่งซื้อ",
  hasPurchases: "ผู้จำหน่ายรายนี้มีรายการสั่งซื้อแล้ว จึงลบไม่ได้ เพื่อให้ชื่อยังแสดงในรายการสั่งซื้อเหล่านั้น",
};

export default suppliers;
