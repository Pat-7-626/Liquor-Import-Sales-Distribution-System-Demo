export type Lang = "th" | "en";

type Entry = { th: string; en: string };
type Dict = { [key: string]: Entry | Dict };

const dict = {
  common: {
    appTitle: { th: "ระบบนำเข้า ขาย และกระจายสินค้าสุรา", en: "Liquor Import, Sales & Distribution System" },
    appTitleShort: { th: "LISD System", en: "LISD System" },
    search: { th: "ค้นหา", en: "Search" },
    allStatuses: { th: "ทุกสถานะ", en: "All statuses" },
    status: { th: "สถานะ", en: "Status" },
    actions: { th: "การดำเนินการ", en: "Actions" },
    edit: { th: "แก้ไข", en: "Edit" },
    save: { th: "บันทึกการเปลี่ยนแปลง", en: "Save changes" },
    cancel: { th: "ยกเลิก", en: "Cancel" },
    close: { th: "ปิด", en: "Close" },
    viewDetails: { th: "ดูรายละเอียด", en: "View details" },
    noResults: { th: "ไม่พบข้อมูลที่ตรงกับเงื่อนไข", en: "No records match your filters" },
    export: { th: "ส่งออก", en: "Export" },
    language: { th: "ภาษา", en: "Language" },
    edited: { th: "แก้ไขแล้ว", en: "Edited" },
    // Shared "Import" / "Sales" domain label — used for License category and the Dashboard's order-kind
    // tag. Deliberately not under `status`: neither is a status (a state something is in); both are a
    // type/category label, so grouping them with Delivered/Expired/Approved would be a category error.
    import: { th: "นำเข้า", en: "Import" },
    sales: { th: "ขาย", en: "Sales" },
    new: { th: "ใหม่", en: "New" },
    back: { th: "ย้อนกลับ", en: "Back" },
    confirm: { th: "ยืนยัน", en: "Confirm" },
    inStock: { th: "คงเหลือ", en: "in stock" },
    demoNotice: {
      th: "ข้อมูลตัวอย่างสำหรับสาธิตหน้าจอเท่านั้น การแก้ไขจะไม่ถูกบันทึกถาวร",
      en: "Demo data for UI walkthrough only — edits are not saved permanently.",
    },
    of: { th: "จาก", en: "of" },
    records: { th: "รายการ", en: "records" },
    all: { th: "ทั้งหมด", en: "All" },
    restrictedTooltip: { th: "ข้อมูลจำกัดสิทธิ์ — Sales Officer/Supervisor เท่านั้น", en: "Restricted — Sales Officer/Supervisor only" },
    resetDemo: { th: "รีเซ็ตข้อมูลสาธิต", en: "Reset demo data" },
    resetConfirm: {
      th: "ล้างการแก้ไขทั้งหมดและเริ่มต้นข้อมูลสาธิตใหม่ ยืนยันหรือไม่?",
      en: "Clear all edits and restore the original demo data. Continue?",
    },
    print: { th: "พิมพ์ / บันทึกเป็น PDF", en: "Print / Save as PDF" },
    notRecorded: { th: "ยังไม่มีข้อมูล", en: "Not recorded" },
    upload: { th: "แนบไฟล์", en: "Attach" },
    remove: { th: "ลบ", en: "Remove" },
  },

  nav: {
    dashboard: { th: "แดชบอร์ด", en: "Dashboard" },
    products: { th: "สินค้า / SKU", en: "Products / SKU" },
    importOrders: { th: "ออเดอร์นำเข้า", en: "Import Orders" },
    licenses: { th: "ใบอนุญาต", en: "Licenses" },
    customers: { th: "ลูกค้า", en: "Customers" },
    salesOrders: { th: "ออเดอร์ขาย", en: "Sales Orders" },
    inventory: { th: "สต๊อกคงเหลือ", en: "Inventory" },
    reports: { th: "รายงาน", en: "Reports" },
    approvals: { th: "รายการรออนุมัติ", en: "Approvals" },
    auditTrail: { th: "ประวัติการดำเนินการ", en: "Audit Trail" },
  },

  dashboard: {
    title: { th: "แดชบอร์ดผู้บริหาร", en: "Executive Dashboard" },
    subtitle: {
      th: "ภาพรวมการนำเข้า การขาย และความเสี่ยงด้านการปฏิบัติตามกฎระเบียบในหน้าจอเดียว",
      en: "Import & sales performance and compliance risk, in one screen",
    },
    kpi: {
      leadTime: { th: "Lead time เฉลี่ยต่อออเดอร์นำเข้า", en: "Avg. import order lead time" },
      errorRate: { th: "อัตราออเดอร์ที่มีข้อผิดพลาดตั้งแต่ต้นทาง", en: "Import order error rate (Staging)" },
      inventoryValue: { th: "มูลค่าสต๊อกคงเหลือทั้งหมด", en: "Total current inventory value" },
      expiringLicenses: { th: "ใบอนุญาตใกล้หมดอายุ (ภายใน 30 วัน)", en: "Licenses expiring within 30 days" },
      taxCost: { th: "ต้นทุนภาษี/อากรรวม (ทุกออเดอร์)", en: "Total tax & duty cost (all orders)" },
      totalSales: { th: "ยอดขายรวมเดือนนี้", en: "Total sales this month" },
      turnover: { th: "Inventory turnover", en: "Inventory turnover" },
      agingStock: { th: "สต๊อกค้างนานเกินกำหนด", en: "Aging stock beyond threshold" },
      onTimeDelivery: { th: "อัตราการส่งมอบตรงเวลา", en: "On-time delivery rate" },
      outstandingCredit: { th: "ยอดเครดิตคงค้างรวมทุกลูกค้า", en: "Total outstanding customer credit" },
    },
    days: { th: "วัน", en: "days" },
    items: { th: "รายการ", en: "items" },
    times: { th: "ครั้ง/เดือน", en: "times/mo" },
    skus: { th: "SKU", en: "SKUs" },
    attentionTitle: { th: "รายการที่ควรให้ความสนใจ", en: "Needs attention" },
    expiringLicensesTitle: { th: "ใบอนุญาตใกล้ครบกำหนด", en: "Licenses expiring soon" },
    agingStockTitle: { th: "สต๊อกค้างนานสูงสุด", en: "Top aging stock" },
    orderIssuesTitle: { th: "ออเดอร์ที่มีปัญหาหรือรอดำเนินการ", en: "Orders with issues or pending action" },
    readyForPickingTitle: { th: "ออเดอร์ที่พร้อมจัดสินค้า", en: "Ready for Picking" },
    readyForPickingEmpty: { th: "ไม่มีออเดอร์ที่รอจัดสินค้าในขณะนี้", en: "No orders currently awaiting picking" },
    importByStatus: { th: "ออเดอร์นำเข้าตามสถานะ", en: "Import orders by status" },
    salesByStatus: { th: "ออเดอร์ขายตามสถานะ", en: "Sales orders by status" },
    allOrdersTitle: { th: "ออเดอร์ทั้งหมด — สถานะแบบเรียลไทม์", en: "All Orders — Real-Time Status" },
    allOrdersSubtitle: {
      th: "ออเดอร์นำเข้าและออเดอร์ขายทุกรายการในหน้าเดียว (BR-01)",
      en: "Every Import Order and Sales Order, in one place (BR-01)",
    },
    counterparty: { th: "คู่ค้า", en: "Counterparty" },
  },

  products: {
    title: { th: "สินค้า / SKU", en: "Products / SKU" },
    subtitle: {
      th: "ข้อมูลหลักสินค้าสุรา ใช้เป็นฐานอ้างอิงในออเดอร์นำเข้าและออเดอร์ขาย",
      en: "Product master data used as reference in import and sales orders",
    },
    col: {
      sku: { th: "SKU", en: "SKU" },
      name: { th: "ชื่อสินค้า", en: "Product Name" },
      category: { th: "ประเภท", en: "Category" },
      abv: { th: "ABV (%)", en: "ABV (%)" },
      packageSize: { th: "ขนาดบรรจุ (ml)", en: "Package Size (ml)" },
      unit: { th: "หน่วยนับ", en: "Unit" },
      costPrice: { th: "ราคาทุน/หน่วย", en: "Cost Price / Unit" },
      suggestedPrice: { th: "ราคาขายแนะนำ", en: "Suggested Price" },
      stockAvailable: { th: "สต๊อกพร้อมขาย", en: "Available Stock" },
      status: { th: "สถานะสินค้า", en: "Status" },
      hsCode: { th: "พิกัดศุลกากร (HS Code)", en: "HS Code" },
    },
    searchPlaceholder: { th: "ค้นหาด้วย SKU หรือชื่อสินค้า...", en: "Search by SKU or product name..." },
    editTitle: { th: "แก้ไขข้อมูลสินค้า", en: "Edit product" },
  },

  importOrders: {
    title: { th: "ออเดอร์นำเข้า", en: "Import Orders" },
    subtitle: {
      th: "ตั้งแต่รับออเดอร์ → ตรวจสอบ (Staging) → อนุมัติ → ผ่านศุลกากร → เข้าคลังสำเร็จ",
      en: "From order intake → Staging validation → Approval → Customs clearance → Received in warehouse",
    },
    col: {
      orderNo: { th: "เลขที่ออเดอร์นำเข้า", en: "Import Order No." },
      supplier: { th: "Supplier", en: "Supplier" },
      country: { th: "ประเทศ", en: "Country" },
      incoterms: { th: "Incoterms", en: "Incoterms" },
      orderDate: { th: "วันที่สั่งซื้อ", en: "Order Date" },
      etaDate: { th: "วันที่คาดว่าถึง", en: "ETA" },
      skuCount: { th: "จำนวนรายการ SKU", en: "SKU Count" },
      totalValue: { th: "มูลค่ารวม (บาท)", en: "Total Value (THB)" },
      status: { th: "สถานะออเดอร์", en: "Status" },
      approver: { th: "ผู้อนุมัติ", en: "Approver" },
      customsDeclarationNo: { th: "เลขที่ใบขนสินค้าขาเข้า", en: "Customs Declaration No." },
    },
    searchPlaceholder: { th: "ค้นหาด้วยเลขที่ออเดอร์หรือ Supplier...", en: "Search by order no. or supplier..." },
    editTitle: { th: "แก้ไขออเดอร์นำเข้า", en: "Edit import order" },
    none: { th: "ยังไม่มี", en: "None yet" },
    newOrder: { th: "สร้างออเดอร์นำเข้าใหม่", en: "New Import Order" },
  },

  newImportOrder: {
    title: { th: "สร้างออเดอร์นำเข้าใหม่", en: "New Import Order" },
    subtitle: {
      th: "ทุกออเดอร์เข้าสู่สถานะ Staging เพื่อตรวจสอบก่อนเข้าระบบหลัก (FR-01–05)",
      en: "Every order enters Staging for validation before it reaches the main system (FR-01–05)",
    },
    backToList: { th: "กลับไปหน้าออเดอร์นำเข้า", en: "Back to Import Orders" },

    sectionIntake: { th: "1. ช่องทางรับออเดอร์", en: "1. Intake Method" },
    intakeApi: { th: "API / EDI", en: "API / EDI" },
    intakeExcel: { th: "อัปโหลด Excel/CSV", en: "Excel/CSV Upload" },
    intakeEmail: { th: "อีเมล + OCR", en: "Email + OCR" },
    intakeManual: { th: "กรอกข้อมูลเอง", en: "Manual Entry" },
    intakeAutoFillNote: {
      th: "จำลองข้อมูลที่ระบบดึงมาจากช่องทางนี้ให้อัตโนมัติ — ตรวจสอบและแก้ไขได้ก่อนส่ง",
      en: "Auto-filled to simulate data pulled in from this channel — review and correct before submitting",
    },
    downloadTemplate: { th: "ดาวน์โหลดเทมเพลต Excel มาตรฐาน", en: "Download standard Excel template" },

    sectionHeader: { th: "2. ข้อมูลออเดอร์", en: "2. Order Details" },
    supplier: { th: "Supplier", en: "Supplier" },
    supplierPlaceholder: { th: "ชื่อ Supplier...", en: "Supplier name..." },

    sectionImportLicense: { th: "3. ใบอนุญาตนำเข้าที่อ้างอิง", en: "3. Import License Reference" },
    selectLicensePlaceholder: { th: "เลือกใบอนุญาตนำเข้า...", en: "Select an import license..." },
    noImportLicenses: { th: "ไม่มีใบอนุญาตนำเข้าในระบบ", en: "No import licenses on file" },
    licenseInfoType1: {
      th: "ประเภทที่ 1: ใบอนุญาตนำเข้าเชิงพาณิชย์แบบเต็มรูปแบบ ไม่จำกัดปริมาณ อายุ 1 ปี",
      en: "Type 1: full commercial import license, no volume cap, valid for 1 year",
    },
    licenseInfoType5: {
      th: "ประเภทที่ 5: ใบอนุญาตนำเข้าแบบจำกัด ปริมาณไม่เกิน 500 หน่วยต่อออเดอร์ และต้องมีหลักประกันเพิ่มเติม",
      en: "Type 5: limited-scope import license, capped at 500 units per order, requires an additional customs bond",
    },
    errorLicenseExpiredForOrder: {
      th: "ใบอนุญาตนำเข้าที่เลือกหมดอายุแล้ว — ผิดเงื่อนไข Import Compliance Risk",
      en: "The selected import license has expired — violates the Import Compliance Risk control",
    },
    errorEtaAfterLicenseExpiry: {
      th: "วันที่คาดว่าถึงอยู่หลังวันหมดอายุใบอนุญาต — ไม่มีหลักฐานว่านำเข้าภายในอายุใบอนุญาต (§7.1)",
      en: "ETA falls after the license expires — no evidence the import happens within the license period (§7.1)",
    },
    errorVolumeCapExceeded: {
      th: "จำนวนรวมเกินเพดานของใบอนุญาตประเภทที่ 5 ({cap} หน่วย)",
      en: "Total quantity exceeds the Type 5 license cap ({cap} units)",
    },

    sectionLines: { th: "4. รายการสินค้า", en: "4. Line Items" },
    addLine: { th: "+ เพิ่มรายการ", en: "+ Add line" },
    removeLine: { th: "ลบ", en: "Remove" },
    lineSku: { th: "SKU", en: "SKU" },
    lineSkuPlaceholder: { th: "เช่น SKU-1001", en: "e.g. SKU-1001" },
    lineAbv: { th: "ABV (%)", en: "ABV (%)" },
    lineQty: { th: "จำนวน", en: "Quantity" },
    lineUnitPrice: { th: "ราคา/หน่วย (บาท)", en: "Unit Price (THB)" },
    noLines: { th: "ยังไม่มีรายการสินค้า", en: "No line items yet" },

    errorSkuNotFound: { th: "SKU นี้ไม่ตรงกับ Product Master", en: "SKU does not match the Product Master" },
    errorAbvRange: { th: "ABV ต้องอยู่ระหว่าง 0–75%", en: "ABV must be between 0–75%" },
    errorPriceDeviation: {
      th: "ราคาต่างจากราคาอ้างอิงในระบบมากกว่า 30%",
      en: "Price differs from the system reference price by more than 30%",
    },
    referencePrice: { th: "ราคาอ้างอิง", en: "reference" },

    summaryTitle: { th: "สรุปและสถานะการตรวจสอบ", en: "Summary & Validation" },
    emptySummary: { th: "เพิ่มรายการสินค้าอย่างน้อย 1 รายการ", en: "Add at least one line item" },
    totalSkus: { th: "จำนวนรายการ SKU", en: "SKU Count" },
    totalValue: { th: "มูลค่ารวม", en: "Total Value" },
    validationOk: { th: "ทุกรายการผ่านการตรวจสอบอัตโนมัติ", en: "All lines pass automatic validation" },
    validationIssues: { th: "พบปัญหาที่ต้องแก้ไขก่อนส่ง", en: "Issues found — correct before submitting" },
    willEnterStaging: {
      th: "ออเดอร์จะเข้าสู่สถานะ \"รอตรวจสอบ (Staging)\" เพื่อรออนุมัติ",
      en: "Order will enter \"Pending Review (Staging)\" awaiting approval",
    },
    willFlagIssue: {
      th: "ออเดอร์จะถูกทำเครื่องหมาย \"มีปัญหา\" — แก้ไขได้ภายหลังจากหน้าออเดอร์นำเข้า",
      en: "Order will be flagged \"Issue Detected\" — correctable later from the Import Orders page",
    },
    submitButton: { th: "ส่งออเดอร์เข้าสู่ Staging", en: "Submit to Staging" },
    createdToast: { th: "สร้างออเดอร์นำเข้าสำเร็จ", en: "Import order created" },
  },

  importOrderDetail: {
    backToList: { th: "กลับไปหน้าออเดอร์นำเข้า", en: "Back to Import Orders" },

    sectionOverview: { th: "ภาพรวมออเดอร์", en: "Order Overview" },
    importLicense: { th: "ใบอนุญาตนำเข้าที่อ้างอิง", en: "Import License Reference" },
    customsClearanceStatus: { th: "สถานะผ่านศุลกากร", en: "Customs Clearance Status" },
    sectionLogistics: { th: "ข้อมูลโลจิสติกส์และการเงิน", en: "Logistics & Financial" },
    sectionTax: { th: "ภาษีและศุลกากร", en: "Tax & Customs" },
    sectionLineItems: { th: "รายการสินค้า", en: "Line Items" },
    sectionDocuments: { th: "เอกสารแนบ", en: "Documents" },
    sectionReceiving: { th: "การรับสินค้าเข้าคลัง", en: "Goods Receiving" },
    sectionHistory: { th: "ประวัติการดำเนินการ", en: "History" },

    manufacturerRegNo: { th: "เลขทะเบียนผู้ผลิต", en: "Manufacturer Registration No." },
    blAwbNumber: { th: "เลขที่ BL/AWB", en: "BL/AWB Number" },
    origin: { th: "ต้นทาง", en: "Origin" },
    destination: { th: "ปลายทาง", en: "Destination" },
    currency: { th: "สกุลเงิน", en: "Currency" },
    paymentTerms: { th: "เงื่อนไขการชำระเงิน", en: "Payment Terms" },
    noLogistics: { th: "ไม่มีข้อมูลโลจิสติกส์สำหรับออเดอร์นี้ (บันทึกเฉพาะออเดอร์ที่สร้างผ่านฟอร์มใหม่)", en: "No logistics data for this order (recorded only for orders created via the New Import Order form)" },

    dutyRate: { th: "อัตราอากรขาเข้า", en: "Duty Rate" },
    importDuty: { th: "อากรขาเข้า", en: "Import Duty" },
    exciseTax: { th: "ภาษีสรรพสามิต", en: "Excise Tax" },
    vat: { th: "ภาษีมูลค่าเพิ่ม (VAT 7%)", en: "VAT (7%)" },
    totalTax: { th: "รวมภาษีและอากร", en: "Total Tax & Duty" },
    exciseStampCount: { th: "จำนวนแสตมป์สรรพสามิตที่ต้องใช้", en: "Excise Stamps Required" },
    noTax: { th: "ยังไม่มีการคำนวณภาษีสำหรับออเดอร์นี้", en: "No tax breakdown calculated for this order" },
    taxDisclaimer: {
      th: "สูตรคำนวณอย่างง่ายสำหรับสาธิต ไม่ใช่อัตราภาษีจริงของกรมสรรพสามิต/ศุลกากร",
      en: "Illustrative demo formula — not the real Excise/Customs tariff schedule",
    },

    noLineItems: { th: "ไม่มีรายละเอียดรายการสินค้าสำหรับออเดอร์นี้", en: "No line-item detail recorded for this order" },
    lineTotal: { th: "มูลค่ารวม", en: "Line Total" },
    editLines: { th: "แก้ไขรายการ", en: "Correct lines" },
    editLinesHint: {
      th: "แก้ไขได้เฉพาะตอนออเดอร์อยู่ใน Staging หรือมีปัญหาการตรวจสอบ (FR-05)",
      en: "Editable while the order is in Staging or has a validation issue (FR-05)",
    },
    saveLines: { th: "บันทึกการแก้ไข", en: "Save corrections" },
    cancelEditLines: { th: "ยกเลิก", en: "Cancel" },
    savedLinesToast: { th: "บันทึกการแก้ไขรายการสินค้าแล้ว", en: "Line items corrected" },
    linesNowValid: { th: "ผ่านการตรวจสอบทั้งหมดแล้ว — จะกลับสู่สถานะ Staging เมื่อบันทึก", en: "All lines now pass validation — will return to Staging on save" },
    linesStillInvalid: { th: "ยังพบปัญหาการตรวจสอบ — จะยังคงเป็น Issue Detected เมื่อบันทึก", en: "Validation issues remain — will stay Issue Detected on save" },

    noDocuments: { th: "ยังไม่มีเอกสารแนบ", en: "No documents attached yet" },
    documentKind: { th: "ประเภทเอกสาร", en: "Document Type" },
    kind: {
      invoice: { th: "ใบแจ้งหนี้ (Invoice)", en: "Invoice" },
      packingList: { th: "ใบรายการบรรจุ (Packing List)", en: "Packing List" },
      billOfLading: { th: "ใบตราส่งสินค้า (Bill of Lading)", en: "Bill of Lading" },
      importLicense: { th: "ใบอนุญาตนำเข้า", en: "Import License" },
      other: { th: "อื่นๆ", en: "Other" },
    },
    chooseFile: { th: "เลือกไฟล์...", en: "Choose file..." },
    attachedToast: { th: "แนบเอกสารแล้ว", en: "Document attached" },
    docsSessionNote: {
      th: "ไฟล์แนบเก็บไว้ในเบราว์เซอร์นี้เท่านั้น (ไม่ใช่การอัปโหลดจริง)",
      en: "Attached files live only in this browser session (not a real upload)",
    },

    receivingIneligible: {
      th: "รับสินค้าได้เมื่อออเดอร์ได้รับการอนุมัติหรือผ่านศุลกากรแล้ว",
      en: "Goods can be received once the order is Approved or Customs Cleared",
    },
    receivingNoLines: {
      th: "การรับสินค้าต้องมีรายละเอียดรายการสินค้า — ใช้ได้เฉพาะออเดอร์ที่สร้างผ่านฟอร์มใหม่",
      en: "Receiving requires line-item detail — only available for orders created via the New Import Order form",
    },
    receivingHistorical: {
      th: "ออเดอร์นี้เข้าคลังแล้วก่อนที่ระบบจะเริ่มบันทึกรายละเอียดการรับสินค้า",
      en: "This order was received into the warehouse before detailed receiving records were tracked",
    },
    receivedDate: { th: "วันที่รับเข้าคลัง", en: "Received Date" },
    orderedQty: { th: "จำนวนที่สั่ง", en: "Ordered Qty" },
    receivedQty: { th: "จำนวนที่รับจริง", en: "Received Qty" },
    lotBatchAssign: { th: "Lot/Batch ที่กำหนด", en: "Assigned Lot/Batch" },
    exciseStampDate: { th: "วันที่ประทับแสตมป์สรรพสามิต", en: "Excise Stamp Date" },
    discrepancyFlag: { th: "จำนวนไม่ตรงกับที่สั่ง", en: "Quantity discrepancy" },
    submitReceiving: { th: "ยืนยันรับสินค้าเข้าคลัง", en: "Confirm Goods Received" },
    receivedToast: { th: "บันทึกการรับสินค้าแล้ว", en: "Goods receipt recorded" },
    alreadyReceived: { th: "รับเข้าคลังแล้วเมื่อ", en: "Received on" },
    receivingMatch: { th: "จำนวนตรงตามที่สั่งทุกรายการ", en: "All quantities match the order" },
    receivingDiscrepancy: { th: "พบส่วนต่างจำนวนในบางรายการ", en: "Quantity discrepancy found on some lines" },

    noHistory: { th: "ยังไม่มีประวัติสำหรับออเดอร์นี้", en: "No history recorded for this order yet" },
  },

  licenses: {
    title: { th: "ใบอนุญาต", en: "Licenses" },
    subtitle: {
      th: "รวมใบอนุญาตนำเข้าและใบอนุญาตขายสุรา พร้อมระบบเตือนล่วงหน้า 30 วัน",
      en: "Import and liquor sales licenses, with 30-day advance expiry alerts",
    },
    col: {
      licenseNo: { th: "เลขที่ใบอนุญาต", en: "License No." },
      type: { th: "ประเภทใบอนุญาต", en: "License Type" },
      holder: { th: "ผู้ถือใบอนุญาต", en: "Holder" },
      category: { th: "หมวด", en: "Category" },
      issueDate: { th: "วันที่ออก", en: "Issue Date" },
      expiryDate: { th: "วันหมดอายุ", en: "Expiry Date" },
      daysRemaining: { th: "จำนวนวันคงเหลือ", en: "Days Remaining" },
      status: { th: "สถานะ", en: "Status" },
    },
    searchPlaceholder: { th: "ค้นหาด้วยเลขที่ใบอนุญาตหรือผู้ถือ...", en: "Search by license no. or holder..." },
    editTitle: { th: "แก้ไขใบอนุญาต", en: "Edit license" },
  },

  customers: {
    title: { th: "ลูกค้า / ตัวแทนจำหน่าย", en: "Customers / Distributors" },
    subtitle: {
      th: "ตรวจสอบใบอนุญาตขายและวงเงินเครดิตก่อนพนักงานขายสร้างออเดอร์",
      en: "Verify sales license and credit limit before a sales order is created",
    },
    col: {
      customerId: { th: "รหัสลูกค้า", en: "Customer ID" },
      name: { th: "ชื่อลูกค้า/ร้านค้า", en: "Customer / Store Name" },
      channelType: { th: "ประเภทช่องทาง", en: "Sales Channel" },
      licenseNo: { th: "เลขใบอนุญาตขายสุรา", en: "Liquor Sales License" },
      licenseExpiry: { th: "วันหมดอายุใบอนุญาต", en: "License Expiry" },
      creditLimit: { th: "วงเงินเครดิต (บาท)", en: "Credit Limit (THB)" },
      outstandingBalance: { th: "ยอดคงค้างปัจจุบัน (บาท)", en: "Outstanding Balance (THB)" },
      creditRemaining: { th: "วงเงินคงเหลือ (บาท)", en: "Credit Remaining (THB)" },
      standardDiscount: { th: "ส่วนลดมาตรฐาน (%)", en: "Standard Discount (%)" },
      creditStatus: { th: "สถานะเครดิต", en: "Credit Status" },
    },
    searchPlaceholder: { th: "ค้นหาด้วยรหัสหรือชื่อลูกค้า...", en: "Search by customer ID or name..." },
    editTitle: { th: "แก้ไขข้อมูลลูกค้า", en: "Edit customer" },
    noLicenseValue: { th: "ไม่มีใบอนุญาต", en: "No license on file" },
  },

  customerDetail: {
    backToList: { th: "กลับไปหน้าลูกค้า", en: "Back to Customers" },
    sectionOverview: { th: "ข้อมูลลูกค้า", en: "Customer Overview" },
    sectionCredit: { th: "การใช้วงเงินเครดิต", en: "Credit Utilization" },
    creditUsedOf: { th: "ใช้ไปแล้วจากวงเงินทั้งหมด", en: "used of total credit limit" },
    sectionOrderHistory: { th: "ประวัติออเดอร์ขาย", en: "Sales Order History" },
    noOrders: { th: "ยังไม่มีออเดอร์ขายสำหรับลูกค้ารายนี้", en: "No sales orders for this customer yet" },
    sectionHistory: { th: "ประวัติการดำเนินการ", en: "History" },
    noHistory: { th: "ยังไม่มีประวัติสำหรับลูกค้ารายนี้", en: "No history recorded for this customer yet" },
  },

  salesOrderDetail: {
    backToList: { th: "กลับไปหน้าออเดอร์ขาย", en: "Back to Sales Orders" },
    sectionOverview: { th: "ข้อมูลออเดอร์", en: "Order Overview" },
    viewCustomer: { th: "ดูข้อมูลลูกค้า", en: "View customer" },
    sectionHistory: { th: "ประวัติการดำเนินการ", en: "History" },
    noHistory: { th: "ยังไม่มีประวัติสำหรับออเดอร์นี้", en: "No history recorded for this order yet" },
    updateDeliveryStatus: { th: "อัปเดตสถานะจัดส่ง (FR-24)", en: "Update delivery status (FR-24)" },
    pendingApprovalBanner: {
      th: "รอหัวหน้างานอนุมัติก่อนออกเอกสารและตัดสต๊อก (FR-22/28)",
      en: "awaiting real supervisor approval before any documents or stock are affected (FR-22/28)",
    },
  },

  salesOrders: {
    title: { th: "ออเดอร์ขาย", en: "Sales Orders" },
    subtitle: {
      th: "จากการปิดขายจนถึงจัดส่ง อ้างอิง lot/batch เพื่อการตรวจสอบย้อนกลับ",
      en: "From order confirmation to delivery, referencing lot/batch for traceability",
    },
    col: {
      orderNo: { th: "เลขที่ออเดอร์ขาย", en: "Sales Order No." },
      customerName: { th: "ลูกค้า", en: "Customer" },
      sku: { th: "SKU", en: "SKU" },
      quantity: { th: "จำนวน", en: "Quantity" },
      unitPrice: { th: "ราคาต่อหน่วย (บาท)", en: "Unit Price (THB)" },
      discountPercent: { th: "ส่วนลด (%)", en: "Discount (%)" },
      netValue: { th: "มูลค่าสุทธิ (บาท)", en: "Net Value (THB)" },
      lotBatch: { th: "Lot/Batch อ้างอิง", en: "Lot/Batch Ref." },
      deliveryStatus: { th: "สถานะจัดส่ง", en: "Delivery Status" },
      taxInvoiceNo: { th: "เลขที่ใบกำกับภาษี", en: "Tax Invoice No." },
      deliveryNoteNo: { th: "เลขที่ใบส่งของ", en: "Delivery Note No." },
      approver: { th: "ผู้อนุมัติส่วนลด/เครดิต", en: "Discount/Credit Approver" },
    },
    searchPlaceholder: { th: "ค้นหาด้วยเลขที่ออเดอร์หรือลูกค้า...", en: "Search by order no. or customer..." },
    editTitle: { th: "แก้ไขออเดอร์ขาย", en: "Edit sales order" },
    none: { th: "ไม่มี", en: "None" },
    newOrder: { th: "สร้างออเดอร์ขายใหม่", en: "New Sales Order" },
  },

  salesOrderDocs: {
    action: { th: "เอกสาร", en: "Documents" },
    pendingApprovalNote: {
      th: "ยังไม่ออกเอกสารจนกว่าหัวหน้างานจะอนุมัติส่วนลด (FR-22)",
      en: "Documents aren't issued until a supervisor approves the discount (FR-22)",
    },
    taxInvoice: { th: "ใบกำกับภาษี", en: "Tax Invoice" },
    deliveryNote: { th: "ใบส่งของ", en: "Delivery Note" },
    pickingList: { th: "ใบจัดสินค้า", en: "Picking List" },
    taxInvoiceTitle: { th: "ใบกำกับภาษี", en: "Tax Invoice" },
    deliveryNoteTitle: { th: "ใบส่งของ", en: "Delivery Note" },
    pickingListTitle: { th: "ใบจัดสินค้า (สำหรับเจ้าหน้าที่คลังสินค้า)", en: "Picking List (for Warehouse Officer)" },
    printedOn: { th: "พิมพ์เมื่อ", en: "Printed on" },
    billTo: { th: "ลูกค้า", en: "Bill To" },
    grandTotal: { th: "ยอดรวมสุทธิ", en: "Grand Total" },
    traceabilityNote: {
      th: "ใบกำกับภาษีนี้อ้างอิง Lot/Batch และวันที่ประทับแสตมป์สรรพสามิต เพื่อการตรวจสอบย้อนกลับจากการนำเข้าจนถึงการขาย (FR-23, §7.2)",
      en: "This tax invoice references the Lot/Batch and its Excise Stamp Date for full traceability from import through sale (FR-23, §7.2)",
    },
    pickedCheckbox: { th: "จัดสินค้าครบตามจำนวนแล้ว", en: "Items picked and verified" },
    signatureSender: { th: "ลายเซ็นผู้ส่งสินค้า", en: "Sender's Signature" },
    signatureReceiver: { th: "ลายเซ็นผู้รับสินค้า", en: "Receiver's Signature" },
  },

  newSalesOrder: {
    title: { th: "สร้างออเดอร์ขายใหม่", en: "New Sales Order" },
    subtitle: {
      th: "ระบบตรวจสอบใบอนุญาต วงเงินเครดิต และส่วนลดแบบเรียลไทม์ (FR-20–22)",
      en: "License, credit limit, and discount checks run live as you build the order (FR-20–22)",
    },
    backToList: { th: "กลับไปหน้าออเดอร์ขาย", en: "Back to Sales Orders" },

    sectionCustomer: { th: "1. ลูกค้า", en: "1. Customer" },
    selectCustomerPlaceholder: { th: "เลือกลูกค้า...", en: "Select a customer..." },
    noLicenseOnFile: { th: "ไม่มีใบอนุญาตในระบบ", en: "No license on file" },

    sectionProduct: { th: "2. สินค้าและ Lot/Batch", en: "2. Product & Lot/Batch" },
    selectProductPlaceholder: { th: "เลือกสินค้า...", en: "Select a product..." },
    selectLotPlaceholder: { th: "เลือก Lot/Batch...", en: "Select a lot/batch..." },
    noLotsAvailable: { th: "ไม่มี Lot/Batch พร้อมขายสำหรับ SKU นี้", en: "No available lot/batch for this SKU" },
    availableStock: { th: "พร้อมขาย", en: "available" },

    sectionPricing: { th: "3. ราคาและส่วนลด", en: "3. Pricing & Discount" },
    standardDiscountNote: { th: "ส่วนลดมาตรฐานของลูกค้ารายนี้", en: "This customer's standard discount" },
    channelPriceNote: { th: "ราคาปรับตามช่องทาง (FR-26)", en: "Channel-adjusted price (FR-26)" },

    summaryTitle: { th: "สรุปออเดอร์และการตรวจสอบ", en: "Order Summary & Checks" },
    emptySummary: { th: "เลือกลูกค้าและสินค้าเพื่อเริ่มต้น", en: "Select a customer and product to get started" },

    checklistLicense: { th: "ใบอนุญาตขายสุราถูกต้องและไม่หมดอายุ", en: "Valid, non-expired liquor sales license" },
    checklistCredit: { th: "อยู่ในวงเงินเครดิตที่อนุมัติ", en: "Within approved credit limit" },
    checklistCreditPending: {
      th: "เกินวงเงินเครดิตที่อนุมัติ — ออเดอร์นี้จะถูกส่งให้หัวหน้างานอนุมัติก่อนออกเอกสาร (FR-21/28)",
      en: "Over approved credit limit — this order will be submitted for real supervisor approval before any documents are issued (FR-21/28)",
    },
    checklistStock: { th: "มีสต๊อกเพียงพอสำหรับจำนวนที่สั่ง", en: "Sufficient stock for the quantity ordered" },
    checklistDiscount: { th: "ส่วนลดอยู่ในเกณฑ์มาตรฐาน", en: "Discount within the standard limit" },
    checklistDiscountPending: {
      th: "ส่วนลดเกินมาตรฐาน — ออเดอร์นี้จะถูกส่งให้หัวหน้างานอนุมัติก่อนออกเอกสาร (FR-22)",
      en: "Over standard discount — this order will be submitted for real supervisor approval before any documents are issued (FR-22)",
    },

    errorNoLicense: {
      th: "ลูกค้ารายนี้ไม่มีใบอนุญาตขายสุรา ไม่สามารถสร้างออเดอร์ได้ (FR-20)",
      en: "This customer has no liquor sales license on file — order cannot be created (FR-20)",
    },
    errorLicenseExpired: {
      th: "ใบอนุญาตของลูกค้าหมดอายุแล้ว ไม่สามารถสร้างออเดอร์ได้ (FR-20)",
      en: "This customer's license has expired — order cannot be created (FR-20)",
    },
    errorStockExceeded: {
      th: "จำนวนที่สั่งเกินสต๊อกคงเหลือใน Lot/Batch นี้",
      en: "Quantity ordered exceeds the remaining stock in this lot/batch",
    },

    confirmButton: { th: "ยืนยันสร้างออเดอร์ขาย", en: "Confirm Sales Order" },
    submitForApprovalButton: { th: "ส่งให้หัวหน้างานอนุมัติ", en: "Submit for Supervisor Approval" },
    createdToast: { th: "สร้างออเดอร์ขายสำเร็จ", en: "Sales order created" },
    submittedForApprovalToast: { th: "ส่งออเดอร์ให้หัวหน้างานอนุมัติแล้ว", en: "Sales order submitted for supervisor approval" },
  },

  inventory: {
    title: { th: "สต๊อกคงเหลือ", en: "Inventory Stock" },
    subtitle: {
      th: "สต๊อกคงเหลือแยกตาม Lot/Batch พร้อมอายุสต๊อก สำหรับติดตามสินค้าค้างนาน",
      en: "Stock by lot/batch with aging, to track slow-moving inventory",
    },
    col: {
      sku: { th: "SKU", en: "SKU" },
      productName: { th: "ชื่อสินค้า", en: "Product Name" },
      lotBatch: { th: "Lot/Batch", en: "Lot/Batch" },
      receivedDate: { th: "วันที่รับเข้าคลัง", en: "Received Date" },
      quantityRemaining: { th: "จำนวนคงเหลือ", en: "Quantity Remaining" },
      ageDays: { th: "อายุสต๊อก (วัน)", en: "Stock Age (days)" },
      status: { th: "สถานะสต๊อก", en: "Status" },
      warehouse: { th: "คลังจัดเก็บ", en: "Warehouse" },
    },
    searchPlaceholder: { th: "ค้นหาด้วย SKU, ชื่อสินค้า หรือ Lot/Batch...", en: "Search by SKU, product name, or lot/batch..." },
    editTitle: { th: "แก้ไขข้อมูลสต๊อก", en: "Edit inventory record" },
  },

  status: {
    available: { th: "พร้อมขาย", en: "Available" },
    lowStock: { th: "ใกล้หมด", en: "Low Stock" },
    outOfStock: { th: "หมดสต๊อก", en: "Out of Stock" },

    staging: { th: "รอตรวจสอบ (Staging)", en: "Pending Review (Staging)" },
    pendingApproval: { th: "รออนุมัติ", en: "Pending Approval" },
    approved: { th: "อนุมัติแล้ว", en: "Approved" },
    customsCleared: { th: "ผ่านศุลกากรแล้ว", en: "Customs Cleared" },
    receivedWarehouse: { th: "เข้าคลังสำเร็จ", en: "Received in Warehouse" },
    issueDetected: { th: "มีปัญหา", en: "Issue Detected" },
    rejected: { th: "ถูกปฏิเสธ — ส่งกลับแก้ไข", en: "Rejected — Returned for Correction" },
    customsClearancePending: { th: "รอผ่านศุลกากร", en: "Pending Clearance" },

    expired: { th: "หมดอายุแล้ว", en: "Expired" },
    expiringSoon: { th: "ใกล้หมดอายุ", en: "Expiring Soon" },
    normal: { th: "ปกติ", en: "Normal" },

    nearLimit: { th: "ใกล้เต็มวงเงิน", en: "Near Credit Limit" },
    overLimit: { th: "เกินวงเงิน", en: "Over Credit Limit" },
    noLicense: { th: "ไม่มีใบอนุญาต", en: "No License" },

    delivered: { th: "ส่งสำเร็จ", en: "Delivered" },
    inDelivery: { th: "กำลังจัดส่ง", en: "In Delivery" },
    pendingShipment: { th: "รอส่ง", en: "Pending Shipment" },
    returned: { th: "ตีกลับ", en: "Returned" },
    damaged: { th: "เสียหาย", en: "Damaged" },

    agingStart: { th: "เริ่มค้าง", en: "Starting to Age" },
    agingLong: { th: "ค้างนาน (Aging)", en: "Long Aging" },
  },

  lookup: {
    category: {
      whisky: { th: "วิสกี้", en: "Whisky" },
      tequila: { th: "เตกีล่า", en: "Tequila" },
      redWine: { th: "ไวน์แดง", en: "Red Wine" },
      whiteWine: { th: "ไวน์ขาว", en: "White Wine" },
      vodka: { th: "วอดก้า", en: "Vodka" },
      gin: { th: "จิน", en: "Gin" },
      liqueur: { th: "ลิเคียว", en: "Liqueur" },
      rum: { th: "รัม", en: "Rum" },
      beer: { th: "เบียร์", en: "Beer" },
    },
    unit: {
      bottle: { th: "ขวด", en: "Bottle" },
      pack: { th: "แพ็ค", en: "Pack" },
    },
    country: {
      scotland: { th: "สกอตแลนด์", en: "Scotland" },
      mexico: { th: "เม็กซิโก", en: "Mexico" },
      france: { th: "ฝรั่งเศส", en: "France" },
      sweden: { th: "สวีเดน", en: "Sweden" },
      uk: { th: "อังกฤษ", en: "United Kingdom" },
      jamaica: { th: "จาเมกา", en: "Jamaica" },
      japan: { th: "ญี่ปุ่น", en: "Japan" },
    },
    channel: {
      distributor: { th: "ตัวแทนจำหน่าย", en: "Distributor" },
      retailWholesale: { th: "ร้านค้าปลีก/ส่ง", en: "Retail/Wholesale Store" },
      restaurantBar: { th: "ร้านอาหาร/บาร์", en: "Restaurant/Bar" },
      online: { th: "ออนไลน์", en: "Online" },
    },
    warehouse: {
      whA: { th: "คลัง A - กรุงเทพ", en: "Warehouse A - Bangkok" },
      whB: { th: "คลัง B - ชลบุรี", en: "Warehouse B - Chonburi" },
      whC: { th: "คลัง C - เชียงใหม่", en: "Warehouse C - Chiang Mai" },
    },
  },

  approvals: {
    title: { th: "รายการรออนุมัติ", en: "Approvals" },
    subtitle: {
      th: "แสดงเฉพาะออเดอร์ที่มีข้อยกเว้นหรือรอดำเนินการ ไม่ต้องตรวจทุกออเดอร์ (FR-27–29)",
      en: "Only orders with exceptions or pending action — no need to review every order (FR-27–29)",
    },
    supervisorOnlyNote: { th: "ต้องมีบทบาทหัวหน้างานจึงจะอนุมัติ/ปฏิเสธได้", en: "Supervisor role required to approve or reject" },
    restrictedBanner: {
      th: "จำกัดสิทธิ์ — เฉพาะบทบาทหัวหน้างานเท่านั้นที่อนุมัติหรือปฏิเสธออเดอร์ได้ บทบาทอื่นดูได้อย่างเดียว",
      en: "Restricted — only the Supervisor role can approve or reject orders here. Other roles can view this page but not act on it.",
    },
    highValueBadge: { th: "มูลค่าสูง — ต้องอนุมัติ 2 ระดับ", en: "High value — needs 2 approvals" },
    needDifferentSupervisor: {
      th: "การอนุมัติระดับที่ 2 ต้องเป็นหัวหน้างานคนละคนกับระดับที่ 1",
      en: "The second approval must come from a different supervisor than the first",
    },

    importSectionTitle: { th: "ออเดอร์นำเข้าที่รอดำเนินการ", en: "Import orders awaiting action" },
    importEmpty: { th: "ไม่มีออเดอร์นำเข้าที่รอดำเนินการ", en: "No import orders awaiting action" },
    approveButton: { th: "อนุมัติ", en: "Approve" },
    rejectButton: { th: "ปฏิเสธ", en: "Reject" },
    fixIssueFirst: { th: "ต้องแก้ไขปัญหาก่อนอนุมัติ", en: "Correct the flagged issue before approving" },

    rejectModalTitle: { th: "ปฏิเสธออเดอร์นำเข้า", en: "Reject import order" },
    rejectReasonLabel: { th: "เหตุผลที่ปฏิเสธ (จำเป็น)", en: "Reason for rejection (required)" },
    rejectReasonPlaceholder: {
      th: "เช่น ราคาต่อหน่วยไม่ตรงกับใบเสนอราคา...",
      en: "e.g. Unit price doesn't match the quotation...",
    },
    rejectConfirm: { th: "ยืนยันปฏิเสธ", en: "Confirm Rejection" },

    salesSectionTitle: { th: "ออเดอร์ขายที่รออนุมัติ (ส่วนลด/เครดิตเกินกำหนด)", en: "Sales orders awaiting approval (over discount/credit limit)" },
    salesSectionNote: {
      th: "ยังไม่ออกเอกสารและยังไม่ตัดสต๊อกจนกว่าหัวหน้างานจะอนุมัติ (FR-22, FR-28)",
      en: "Not yet booked, stocked, or invoiced until a supervisor approves (FR-22, FR-28)",
    },
    salesEmpty: { th: "ไม่มีออเดอร์ขายที่รออนุมัติ", en: "No sales orders awaiting approval" },
    reasonCol: { th: "เหตุผลที่ต้องอนุมัติ", en: "Reason for Approval" },

    approvedToast: { th: "อนุมัติออเดอร์แล้ว", en: "Order approved" },
    rejectedToast: { th: "ปฏิเสธออเดอร์แล้ว", en: "Order rejected" },
  },

  auditTrail: {
    title: { th: "ประวัติการดำเนินการ", en: "Audit Trail" },
    subtitle: {
      th: "บันทึกผู้อนุมัติ แก้ไข หรือปฏิเสธรายการ พร้อมเวลาที่ดำเนินการ (BR-04)",
      en: "Who approved, modified, or rejected each record, and when (BR-04)",
    },
    searchPlaceholder: { th: "ค้นหาด้วยเลขที่รายการ...", en: "Search by record ID..." },
    col: {
      timestamp: { th: "เวลา", en: "Timestamp" },
      entity: { th: "รายการ", en: "Record" },
      action: { th: "การดำเนินการ", en: "Action" },
      actor: { th: "ผู้ดำเนินการ", en: "Actor" },
      summary: { th: "รายละเอียด", en: "Details" },
    },
    action: {
      created: { th: "สร้างใหม่", en: "Created" },
      updated: { th: "แก้ไข", en: "Updated" },
      approved: { th: "อนุมัติ", en: "Approved" },
      rejected: { th: "ปฏิเสธ", en: "Rejected" },
    },
    entityType: {
      importOrder: { th: "ออเดอร์นำเข้า", en: "Import Order" },
      salesOrder: { th: "ออเดอร์ขาย", en: "Sales Order" },
      product: { th: "สินค้า", en: "Product" },
      license: { th: "ใบอนุญาต", en: "License" },
      customer: { th: "ลูกค้า", en: "Customer" },
      inventory: { th: "สต๊อก", en: "Inventory" },
    },
  },

  reports: {
    title: { th: "รายงาน", en: "Reports" },
    subtitle: {
      th: "ยอดขายและมูลค่าสต๊อกแยกตาม SKU ช่องทาง และลูกค้า (BR-05, BR-09, FR-25)",
      en: "Sales and inventory value broken out by SKU, channel, and customer (BR-05, BR-09, FR-25)",
    },
    salesBySku: { th: "ยอดขายตาม SKU", en: "Sales by SKU" },
    salesByChannel: { th: "ยอดขายตามช่องทาง", en: "Sales by Channel" },
    salesByCustomer: { th: "ยอดขายตามลูกค้า", en: "Sales by Customer" },
    inventoryByStatus: { th: "มูลค่าสต๊อกตามอายุสต๊อก", en: "Inventory Value by Aging Status" },
    inventoryByPipelineStatus: { th: "มูลค่าสต๊อกตามสถานะขั้นตอน (BR-09)", en: "Inventory Value by Pipeline Status (BR-09)" },
    inventoryByPipelineNote: {
      th: "แยกมูลค่าที่ยังอยู่ระหว่างขนส่ง/ผ่านศุลกากร ออกจากมูลค่าที่พร้อมขายแล้ว",
      en: "Splits value still in transit/customs clearance from value already available for sale",
    },
    pipelineInTransit: { th: "ระหว่างขนส่ง / รอผ่านศุลกากร", en: "In Transit / Customs Clearance" },
    pipelineAvailable: { th: "พร้อมขาย", en: "Available for Sale" },
    colOrders: { th: "จำนวนออเดอร์", en: "Orders" },
    colQty: { th: "จำนวนที่ขาย", en: "Qty Sold" },
    colNetValue: { th: "มูลค่าสุทธิ (บาท)", en: "Net Value (THB)" },
    colAvgDiscount: { th: "ส่วนลดเฉลี่ย", en: "Avg. Discount" },
    colLots: { th: "จำนวน Lot", en: "Lots" },
    colQtyOnHand: { th: "จำนวนคงเหลือ", en: "Qty on Hand" },
    colStockValue: { th: "มูลค่าสต๊อก (บาท)", en: "Stock Value (THB)" },
    colOrderCount: { th: "จำนวนออเดอร์", en: "Order Count" },
    exportSection: { th: "ส่งออก", en: "Export" },
    noData: { th: "ยังไม่มีข้อมูลสำหรับรายงานนี้", en: "No data yet for this report" },
    taxReconciliation: { th: "กระทบยอดภาษีและยอดขายรายเดือน", en: "Monthly Tax & Sales Reconciliation" },
    taxReconciliationNote: {
      th: "รวมภาษี/อากรนำเข้าตามวันที่สั่งซื้อ และยอดขายสุทธิตามวันที่สร้างออเดอร์ขาย สำหรับเจ้าหน้าที่ภาษี",
      en: "Import tax/duty totaled by order date, sales net value totaled by sales order creation date — for the Tax Officer",
    },
    colMonth: { th: "เดือน", en: "Month" },
    colSalesNetValue: { th: "ยอดขายสุทธิ (บาท)", en: "Sales Net Value (THB)" },
  },

  productLabels: {
    action: { th: "ประวัติฉลาก", en: "Label History" },
    title: { th: "ประวัติฉลากสินค้า", en: "Product Label History" },
    version: { th: "เวอร์ชัน", en: "Version" },
    registeredDate: { th: "วันที่ขึ้นทะเบียน", en: "Registered Date" },
    note: { th: "หมายเหตุ", en: "Note" },
    noLabels: { th: "ยังไม่มีประวัติฉลากสำหรับ SKU นี้", en: "No label history recorded for this SKU" },
  },
} satisfies Dict;

export type TranslationKey = string;

function resolve(path: string): Entry {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = dict;
  for (const p of parts) {
    node = node?.[p];
  }
  if (!node || typeof node.th !== "string") {
    console.warn(`Missing translation for key: ${path}`);
    return { th: path, en: path };
  }
  return node as Entry;
}

export function translate(lang: Lang, path: string): string {
  return resolve(path)[lang];
}
