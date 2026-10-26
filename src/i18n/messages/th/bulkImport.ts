import type en from "../en/bulkImport";

const bulkImport: typeof en = {
  description: "เพิ่มสินค้าหลายรายการพร้อมกัน: เลือกจากฐานข้อมูลยาสาธารณะ หรืออัปโหลดไฟล์ CSV ของคุณเอง",

  // Mode choice
  modeWeb: "นำเข้าจากเว็บ",
  modeWebHint:
    "เหมาะกับยาทั่วไป ค้นหายาแล้วระบบจะกรอกชื่อ ชื่อสามัญ ผู้ผลิต และการต้องใช้ใบสั่งยาให้ คุณกำหนดราคาเอง",
  modeCsv: "นำเข้าไฟล์ CSV",
  modeCsvHint:
    "เหมาะกับสินค้าในประเทศหรือยาสามัญจำนวนมาก ดาวน์โหลดแม่แบบ กรอกข้อมูลแต่ละคอลัมน์ แล้วอัปโหลดไฟล์",

  // Import from the web
  poweredBy:
    "ใช้ฐานข้อมูลยาฟรีของ openFDA และ RxNorm ซึ่งเป็นข้อมูลยาในสหรัฐอเมริกา โปรดตรวจสอบสินค้าแต่ละรายการก่อนนำเข้า",
  searchAndPick: "ค้นหาและเลือก",
  bulkAdd: "เพิ่มหลายรายการ",
  searchPlaceholder: "ชื่อการค้า ชื่อสามัญ หรือตัวยาสำคัญ…",
  search: "ค้นหา",
  tabResults: "ผลการค้นหา",
  tabBrowse: "เลือกตามหมวด",
  typeToSearch: "พิมพ์ชื่อยาด้านบนเพื่อค้นหาในฐานข้อมูล",
  searching: "กำลังค้นหา…",
  noMatches: "ไม่พบผลลัพธ์สำหรับ “{query}”",
  didYouMean: "หมายถึง {name} หรือไม่?",
  chooseClass: "เลือกหมวดเพื่อดูยาในหมวดนั้น",
  add: "เพิ่ม",
  added: "เพิ่มแล้ว",
  addAll: "เพิ่มทั้งหมด",
  classPainRelief: "แก้ปวดและอักเสบ (NSAIDs)",
  classAntibiotics: "ยาปฏิชีวนะ (กลุ่มเพนิซิลลิน)",
  classMacrolides: "ยาปฏิชีวนะ (กลุ่มแมโครไลด์)",
  classAntihistamines: "แก้แพ้ (ยาต้านฮีสตามีน)",
  classAntacids: "ลดกรดในกระเพาะ (PPIs)",
  classDiabetes: "เบาหวาน (เมทฟอร์มิน)",
  classCholesterol: "ลดไขมัน (สแตติน)",
  classBloodPressure: "ความดันโลหิต (ARBs)",
  classCalciumChannel: "ความดันโลหิต (ยาต้านแคลเซียม)",
  classSteroids: "คอร์ติโคสเตียรอยด์",
  classAntidepressants: "ยาต้านซึมเศร้า (SSRIs)",
  bulkHint: "บรรทัดละหนึ่งรายการ สูงสุด {max} รายการ แต่ละบรรทัดจะจับคู่กับยาที่ใกล้เคียงที่สุดในฐานข้อมูล",
  bulkPlaceholder: "Amoxicillin 500\nParacetamol\nCetirizine 10 mg",
  findAndAdd: "ค้นหาและเพิ่ม",
  bulkAdded: "เพิ่ม {count} รายการในรายการรอนำเข้าแล้ว",
  bulkNotFound: "ไม่พบ: {names}",
  bulkEmpty: "กรอกชื่อยาอย่างน้อยหนึ่งรายการ",
  bulkTooMany: "กรอกได้ครั้งละไม่เกิน {max} รายการ",
  catalogUnavailable: "เชื่อมต่อฐานข้อมูลยาไม่ได้ โปรดลองใหม่อีกครั้ง",

  // Import a CSV file
  csvStep1: "ดาวน์โหลดแม่แบบ",
  csvStep1Hint:
    "เปิดใน Excel หรือ Google Sheets แล้วกรอกสินค้าแถวละหนึ่งรายการ ต้องกรอกเฉพาะ name และ sale_price",
  downloadTemplate: "ดาวน์โหลดแม่แบบ",
  csvStep2: "อัปโหลดไฟล์",
  csvStep2Hint:
    "บันทึกเป็น CSV (UTF-8) วันที่ใช้รูปแบบ YYYY-MM-DD หรือ DD/MM/YYYY ได้ ปี พ.ศ. จะแปลงให้อัตโนมัติ",
  dropFile: "วางไฟล์ CSV ที่นี่ หรือคลิกเพื่อเลือกไฟล์",
  csvLoaded: "เพิ่ม {count} แถวจาก {file} ในรายการรอนำเข้าแล้ว",
  csvNoName: "ไฟล์นี้ไม่มีคอลัมน์ name โปรดใช้ชื่อคอลัมน์ตามแม่แบบ",
  csvEmpty: "ไฟล์นี้ไม่มีแถวสินค้า",
  csvNotCsv: "โปรดเลือกไฟล์ .csv ใน Excel ให้ใช้ บันทึกเป็น แล้วเลือก CSV UTF-8",
  csvUnknownColumns: "คอลัมน์ที่ไม่ได้ใช้: {columns}",
  csvTooMany: "เพิ่มเฉพาะ {max} แถวแรก",
  csvColumns: "คอลัมน์",

  // Queue
  queueTitle: "พร้อมนำเข้า",
  queueHint: "ตรวจสอบสินค้าแต่ละรายการและกำหนดราคา จะยังไม่บันทึกจนกว่าจะกดนำเข้า",
  queueEmpty: "ยังไม่มีสินค้าในรายการรอนำเข้า",
  queueEmptyHint: "เลือกยาจากฐานข้อมูลหรืออัปโหลดไฟล์ CSV แล้วสินค้าจะแสดงที่นี่",
  queueCount: "{count} รายการ",
  queueFull: "รายการรอนำเข้ารับได้ไม่เกิน {max} รายการ โปรดนำเข้ารายการเหล่านี้ก่อน",
  clearQueue: "ล้างทั้งหมด",
  remove: "นำออก",
  importButton: "นำเข้า {count} รายการ",
  importing: "กำลังนำเข้า…",
  viewProducts: "ดูสินค้า",

  // Results
  imported: "นำเข้าสินค้า {count} รายการแล้ว",
  fixRows: "มีสินค้า {count} รายการที่ต้องแก้ไข ยังไม่มีการนำเข้าใดๆ",
  tooManyRows: "นำเข้าได้ครั้งละไม่เกิน {max} รายการ",
  nothingToImport: "โปรดเพิ่มสินค้าในรายการรอนำเข้าก่อน",
  duplicateProduct: "มีสินค้านี้อยู่แล้ว หรือซ้ำกันในรายการนี้",
  duplicateBarcode: "บาร์โค้ดนี้ถูกใช้แล้ว หรือซ้ำกันในรายการนี้",
};

export default bulkImport;
