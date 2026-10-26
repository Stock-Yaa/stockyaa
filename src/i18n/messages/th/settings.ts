import type en from "../en/settings";

const settings: typeof en = {
  title: "ตั้งค่า",
  description: "ข้อมูลร้านขายยาและบัญชีของคุณ",

  // Pharmacy profile
  profileTitle: "ข้อมูลร้านขายยา",
  profileDescription: "แสดงบนใบเสร็จ และใช้กับราคา วันที่ และการแจ้งเตือนสต็อก",
  adminOnly: "เฉพาะผู้ดูแลร้านเท่านั้นที่แก้ไขข้อมูลร้านขายยาได้",
  pharmacyName: "ชื่อร้านขายยา",
  licenseNumber: "เลขที่ใบอนุญาต",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  currency: "สกุลเงิน",
  timezone: "เขตเวลา",
  taxRate: "อัตราภาษี (%)",
  taxRateHint: "บวกเพิ่มจากยอดรวมสินค้าเมื่อขายหน้าร้าน ใส่ 0 หากไม่ต้องการแสดงบรรทัดภาษี",
  taxRateRange: "กรุณากรอกอัตราภาษีตั้งแต่ 0 ถึง 100",
  expiryAlertDays: "แจ้งเตือนก่อนหมดอายุ (วัน)",
  expiryAlertDaysHint: "ล็อตที่จะหมดอายุภายในจำนวนวันนี้จะถูกแจ้งเตือนว่าใกล้หมดอายุ",
  expiryAlertDaysRange: "กรุณากรอกจำนวนวันเป็นจำนวนเต็มตั้งแต่ 1 ถึง 365",
  receiptFooter: "ข้อความท้ายใบเสร็จ",
  receiptFooterHint: "พิมพ์ที่ด้านล่างของใบเสร็จทุกใบ",
  invalidOption: "กรุณาเลือกจากตัวเลือกที่มีให้",
  profileSaved: "บันทึกข้อมูลร้านขายยาเรียบร้อยแล้ว",

  // My account
  accountTitle: "บัญชีของฉัน",
  accountDescription: "ชื่อของคุณที่แสดงในระบบ",
  myProfileDescription: "ชื่อ อีเมลสำหรับเข้าสู่ระบบ และรหัสผ่านของคุณ",
  yourName: "ชื่อของคุณ",
  signInEmail: "อีเมลสำหรับเข้าสู่ระบบ",
  signInEmailHint: "หากต้องการเปลี่ยนอีเมล กรุณาติดต่อผู้ดูแลแพลตฟอร์ม",
  nameSaved: "บันทึกชื่อเรียบร้อยแล้ว",
  passwordTitle: "เปลี่ยนรหัสผ่าน",
  passwordDescription: "ควรใช้รหัสผ่านที่ไม่ซ้ำกับที่ใช้ในบริการอื่น",
  currentPassword: "รหัสผ่านปัจจุบัน",
  newPassword: "รหัสผ่านใหม่",
  confirmPassword: "ยืนยันรหัสผ่านใหม่",
  passwordHint: "อย่างน้อย 8 ตัวอักษร",
  passwordTooShort: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  passwordMismatch: "รหัสผ่านไม่ตรงกัน",
  currentPasswordWrong: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  changePassword: "เปลี่ยนรหัสผ่าน",
  passwordChanged: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว",
};

export default settings;
