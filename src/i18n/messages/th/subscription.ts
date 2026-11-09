import type en from "../en/subscription";

const subscription: typeof en = {
  title: "แพ็กเกจ",
  description: "แพ็กเกจและสถานะการใช้งานของคุณ",
  bannerSuspended: "ร้านนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลแพลตฟอร์ม",
  bannerExpired: "แพ็กเกจของคุณหมดอายุแล้ว กรุณาต่ออายุเพื่อใช้งานระบบต่อ",
  bannerEndingSoon: "แพ็กเกจของคุณจะหมดอายุในวันที่ {date}",
  bannerLink: "ดูแพ็กเกจ",
  currentPlan: "แพ็กเกจปัจจุบัน",
  noPlan: "ยังไม่ได้กำหนดแพ็กเกจ",
  perMonth: "{price} / เดือน",
  status: "สถานะ",
  statusTrial: "ทดลองใช้",
  statusActive: "ใช้งานอยู่",
  statusCancelled: "ยกเลิกแล้ว",
  statusExpired: "หมดอายุ",
  statusSuspended: "ถูกระงับ",
  validUntil: "ใช้ได้ถึง",
  noEndDate: "ไม่มีวันหมดอายุ",
  daysLeft: "เหลืออีก {days} วัน",
  daysLeftOne: "เหลืออีก {days} วัน",
  lastDay: "เหลือไม่ถึง 1 วัน",
  endedOn: "หมดอายุเมื่อ {date}",
  accessBlockedTitle: "การใช้งานถูกพักไว้",
  accessBlockedBody:
    "คุณยังเข้าสู่ระบบและดูหน้านี้ได้ แต่ส่วนอื่นของระบบจะถูกล็อกจนกว่าจะต่ออายุแพ็กเกจ",
  reasonSuspended: "ร้านนี้ถูกผู้ดูแลแพลตฟอร์มระงับการใช้งาน",
  reasonCancelled: "แพ็กเกจถูกยกเลิกแล้ว",
  reasonExpired: "แพ็กเกจหมดอายุเมื่อวันที่ {date}",
  howToRenewTitle: "วิธีต่ออายุหรือเปลี่ยนแพ็กเกจ",
  howToRenewBody:
    "ผู้ดูแลแพลตฟอร์มเป็นผู้จัดการแพ็กเกจ กรุณาติดต่อเพื่อขอต่ออายุ อัปเกรด หรือยกเลิก ระบบชำระเงินออนไลน์จะเปิดให้ใช้ภายหลัง",
  availablePlans: "แพ็กเกจที่มีให้เลือก",
  availablePlansHint: "แสดงไว้เพื่อเป็นข้อมูล หากต้องการเปลี่ยนแพ็กเกจ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม",
  branches: "สาขา",
  branchesUsed: "ใช้ไป {used} จาก {limit} สาขา",
  branchesIncluded: "สูงสุด {count} สาขา",
  branchIncluded: "1 สาขา",
  yourPlan: "แพ็กเกจของคุณ",
};

export default subscription;
