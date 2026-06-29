/**
 * ============================================================
 *  ระบบออกใบกำกับภาษี + ส่งอีเมล + ตรวจจับการตีกลับ (bounce)
 *  บริษัท พากันรวย ฟู้ดส์ คอร์ปอเรชั่น จำกัด (จริงใจหมูกระทะ)
 *  Backend: Google Apps Script (Web App)
 *  Template: อิงรูปแบบบิล JJRD1005
 * ============================================================
 */

// ================= CONFIG (แก้ตรงนี้) =================
const CONFIG = {
  SHEET_NAME: 'Invoices',

  SHOP: {
    name: 'บริษัท พากันรวย ฟู้ดส์ คอร์ปอเรชั่น จำกัด',
    taxBranch: 'สำนักงานใหญ่',
    taxId: '0105566172139',
    address: '244/7 ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
    phone: '',                                  // ใส่เบอร์ถ้าต้องการให้แสดงในอีเมล
    senderName: 'จริงใจหมูกระทะ',
  },

  VAT_RATE: 0.07,

  // สาขาที่ออกบิล -> กำหนดคำนำหน้าเลขบิล และเลขเริ่มต้น (start = เลขบิลใบแรกที่จะออก)
  BRANCHES: [
    { label: 'รัชดา',    prefix: 'JJRD', start: 1006 },
    { label: 'ลาดพร้าว', prefix: 'JJLP', start: 1001 },
  ],

  // ถ้าไม่พบการตีกลับภายในกี่นาที ให้ถือว่า "ส่งถึงแล้ว (ไม่พบการตีกลับ)"
  ASSUME_DELIVERED_AFTER_MIN: 30,

  // โฟลเดอร์ใน Google Drive สำหรับเก็บสำเนา PDF (จะสร้างให้อัตโนมัติ)
  DRIVE_FOLDER: 'ใบกำกับภาษี-จริงใจหมูกระทะ',
};

const STATUS = {
  SENDING:   'กำลังส่ง',
  DELIVERED: 'ส่งถึงแล้ว',
  FAILED:    'ส่งไม่สำเร็จ',
  ERROR:     'ผิดพลาด',
  CANCELLED: 'ยกเลิก',
};

const HEADERS = [
  'Timestamp', 'BillNo', 'BranchPrefix', 'CustomerName', 'TaxID', 'CustomerPhone', 'Address',
  'Email', 'ItemsJSON', 'Gross', 'Discount', 'Net', 'VAT', 'GrandTotal',
  'PaymentMethod', 'Status', 'StatusDetail', 'MessageId', 'SentAt', 'LastUpdated', 'ResendCount', 'PdfUrl'
];

// ================= เสิร์ฟหน้าเว็บ =================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ออกใบกำกับภาษี - จริงใจหมูกระทะ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= ตั้งค่าระบบ (รันครั้งเดียว) =================
function setupAll() {
  ensureSheet_();
  installBounceTrigger_();
  return 'ติดตั้งเรียบร้อย: สร้างชีต + ตั้ง trigger ตรวจการตีกลับทุก 5 นาที';
}

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#BC2B30').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function installBounceTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkBounces') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkBounces').timeBased().everyMinutes(5).create();
}

/** ตั้งเลขบิลปัจจุบันด้วยตนเอง (ถ้าต้องการ) เช่น setBillCounter('JJRD', 1005) */
function setBillCounter(prefix, lastUsedNumber) {
  PropertiesService.getScriptProperties().setProperty('SEQ_' + prefix, String(lastUsedNumber));
  return 'ตั้งเลขล่าสุดของ ' + prefix + ' = ' + lastUsedNumber + ' (ใบถัดไปจะเป็น ' + (lastUsedNumber + 1) + ')';
}

// ================= ค้นที่อยู่จากรหัสไปรษณีย์ =================
function lookupZip(zip) {
  zip = String(zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return [];
  var arr = (typeof THAI_ZIP !== 'undefined' && THAI_ZIP.z) ? THAI_ZIP.z[zip] : null;
  if (!arr) return [];
  return arr.map(function (x) {
    return { tambon: x[0], amphoe: x[1], province: THAI_ZIP.p[x[2]] };
  });
}

// ================= ส่ง config ให้หน้าเว็บ =================
function getConfig() {
  return {
    shop: CONFIG.SHOP,
    vatRate: CONFIG.VAT_RATE,
    branches: CONFIG.BRANCHES,
    assumeAfterMin: CONFIG.ASSUME_DELIVERED_AFTER_MIN,
  };
}

// ================= ออกเลขบิล (รันต่อสาขา) =================
function nextBillNumber_(prefix, start) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'SEQ_' + prefix;
    const cur = props.getProperty(key);
    let seq = (cur === null) ? (start || 1) : parseInt(cur, 10) + 1;
    props.setProperty(key, String(seq));
    let n = String(seq);
    while (n.length < 4) n = '0' + n;
    return prefix + n;
  } finally {
    lock.releaseLock();
  }
}

// ================= คำนวณยอด (ราคาในรายการ = รวม VAT แล้ว) =================
function computeTotals_(items, opts) {
  opts = opts || {};
  let gross = 0;
  items.forEach(function (it) {
    const amt = (it.qty && Number(it.qty) > 0) ? Number(it.qty) * Number(it.price) : Number(it.price);
    gross += amt;
  });
  gross = round2_(gross);                                  // รวมทั้งสิ้น (รวม VAT)
  const discount = round2_(Number(opts.discount) || 0);    // ส่วนลด
  const afterDiscount = round2_(gross - discount);         // คงเหลือ (รวม VAT) = ยอดที่จ่ายจริง
  const net = round2_(afterDiscount / (1 + CONFIG.VAT_RATE)); // มูลค่าสุทธิ (ก่อน VAT)
  const vat = round2_(afterDiscount - net);                // VAT 7% (ถอดออกมา)
  const total = afterDiscount;                             // รวมเป็นเงินทั้งสิ้น = ราคาที่ใส่
  return { gross: gross, discount: discount, net: net, vat: vat, total: total };
}
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// ================= ออกใบ + ส่งอีเมล =================
function issueInvoice(payload) {
  try {
    if (!payload.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
      return { ok: false, message: 'รูปแบบอีเมลผู้รับไม่ถูกต้อง' };
    }
    if (!payload.items || !payload.items.length) {
      return { ok: false, message: 'ยังไม่มีรายการสินค้า/บริการ' };
    }
    if (!/^\d{13}$/.test(String(payload.taxId || ''))) {
      return { ok: false, message: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' };
    }

    const branch = CONFIG.BRANCHES.filter(function (b) { return b.prefix === payload.branchPrefix; })[0]
      || CONFIG.BRANCHES[0];
    const sh = ensureSheet_();
    const billNo = nextBillNumber_(branch.prefix, branch.start);
    const totals = computeTotals_(payload.items, { discount: payload.discount });
    const now = new Date();

    const invoice = {
      billNo: billNo,
      date: now,
      customerName: payload.customerName || '-',
      taxId: payload.taxId || '-',
      phone: payload.phone || '',
      address: payload.address || '-',
      email: payload.email.trim(),
      items: payload.items,
      paymentMethod: payload.paymentMethod || 'เงินสด / QR Payment',
      gross: totals.gross, discount: totals.discount, net: totals.net,
      vat: totals.vat, grandTotal: totals.total,
    };

    sh.appendRow([
      now, billNo, branch.prefix, invoice.customerName, invoice.taxId, invoice.phone, invoice.address,
      invoice.email, JSON.stringify(payload.items), totals.gross, totals.discount,
      totals.net, totals.vat, totals.total, invoice.paymentMethod,
      STATUS.SENDING, 'กำลังส่งอีเมล', '', '', now, 0
    ]);

    const result = sendInvoiceEmail_(invoice, true);
    const rowIdx = findRowByBill_(sh, billNo);

    if (result.ok) {
      updateRow_(sh, rowIdx, {
        Status: STATUS.SENDING, StatusDetail: 'ส่งแล้ว รอตรวจการตีกลับ',
        MessageId: result.messageId, SentAt: new Date(), LastUpdated: new Date(),
        PdfUrl: result.pdfUrl || '',
      });
      return { ok: true, billNo: billNo, message: 'ออกบิลและส่งอีเมลแล้ว: ' + billNo };
    } else {
      updateRow_(sh, rowIdx, {
        Status: STATUS.ERROR, StatusDetail: 'ส่งไม่ออก: ' + result.message, LastUpdated: new Date(),
        PdfUrl: result.pdfUrl || '',
      });
      return { ok: false, billNo: billNo, message: 'ส่งอีเมลไม่สำเร็จ: ' + result.message };
    }
  } catch (e) {
    return { ok: false, message: 'ผิดพลาด: ' + e.message };
  }
}

function sendInvoiceEmail_(invoice, saveCopy) {
  let pdfUrl = '';
  try {
    const pdf = buildInvoicePdf_(invoice);
    // บันทึกสำเนาลง Google Drive (เฉพาะตอนออกบิลครั้งแรก)
    if (saveCopy) {
      try { pdfUrl = savePdfToDrive_(pdf, invoice.billNo); } catch (e) { pdfUrl = ''; }
    }
    const subject = 'ใบเสร็จรับเงิน/ใบกำกับภาษี เลขที่ ' + invoice.billNo + ' - ' + CONFIG.SHOP.senderName;
    const body =
      'เรียน ' + invoice.customerName + '\n\n' +
      'แนบใบเสร็จรับเงิน/ใบกำกับภาษีเลขที่ ' + invoice.billNo +
      ' ยอดรวมทั้งสิ้น ' + fmt_(invoice.grandTotal) + ' บาท (รวม VAT 7%)\n\n' +
      'ขอบคุณที่ใช้บริการ\n' + CONFIG.SHOP.senderName +
      (CONFIG.SHOP.phone ? '\nโทร ' + CONFIG.SHOP.phone : '');
    GmailApp.sendEmail(invoice.email, subject, body, {
      name: CONFIG.SHOP.senderName, attachments: [pdf],
    });
    return { ok: true, messageId: invoice.billNo, pdfUrl: pdfUrl };
  } catch (e) {
    return { ok: false, message: e.message, pdfUrl: pdfUrl };
  }
}

// ================= บันทึกสำเนา PDF ลง Google Drive =================
function getInvoiceFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PDF_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* โฟลเดอร์ถูกลบ -> สร้างใหม่ */ }
  }
  const name = CONFIG.DRIVE_FOLDER || 'ใบกำกับภาษี';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('PDF_FOLDER_ID', folder.getId());
  return folder;
}

function savePdfToDrive_(blob, billNo) {
  const folder = getInvoiceFolder_();
  // ถ้ามีไฟล์ชื่อเดียวกันอยู่แล้ว ย้ายลงถังขยะก่อน (กันซ้ำ)
  const existing = folder.getFilesByName(billNo + '.pdf');
  while (existing.hasNext()) existing.next().setTrashed(true);
  const file = folder.createFile(blob.copyBlob().setName(billNo + '.pdf'));
  return file.getUrl();
}

// ================= สร้าง PDF ใบกำกับภาษี (รูปแบบบิล JJRD) =================
function buildInvoicePdf_(invoice) {
  const itemRows = invoice.items.map(function (it, i) {
    const hasQty = it.qty && Number(it.qty) > 0;
    const amt = hasQty ? Number(it.qty) * Number(it.price) : Number(it.price);
    return '<tr>' +
      '<td class="c">' + (i + 1) + '</td>' +
      '<td>' + esc_(it.name) + '</td>' +
      '<td class="c">' + (hasQty ? it.qty : '') + '</td>' +
      '<td class="r">' + fmt_(it.price) + '</td>' +
      '<td class="r">' + fmt_(round2_(amt)) + '</td>' +
      '<td class="c"><span class="ck"></span></td>' +
      '<td class="c"><span class="ck"></span></td>' +
      '</tr>';
  }).join('');
  // เติมแถวว่างให้ตารางสูงเหมือนบิลจริง
  let blanks = '';
  for (let b = invoice.items.length; b < 6; b++) {
    blanks += '<tr><td class="c">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  }

  const dateStr = Utilities.formatDate(invoice.date, 'Asia/Bangkok', 'dd/MM/yyyy');
  const addrHtml = esc_(invoice.address).replace(/\\n|\n/g, '<br>');

  // ฝังฟอนต์ Prompt ถ้ามีไฟล์ FontData.gs (ถ้าไม่มีก็ใช้ฟอนต์ปกติ ไม่ error)
  let fontFace = '';
  if (typeof PROMPT_400 !== 'undefined' && typeof PROMPT_700 !== 'undefined') {
    fontFace =
      '@font-face{font-family:Prompt;font-style:normal;font-weight:400;' +
        'src:url(data:font/ttf;base64,' + PROMPT_400 + ') format("truetype");}' +
      '@font-face{font-family:Prompt;font-style:normal;font-weight:700;' +
        'src:url(data:font/ttf;base64,' + PROMPT_700 + ') format("truetype");}';
  }

  // ลายเซ็นผู้รับเงิน (จากไฟล์ SigData.gs) ถ้าไม่มีก็เว้นว่างไว้เซ็นเอง
  let sigImg = '';
  if (typeof SIGNATURE_PNG !== 'undefined' && SIGNATURE_PNG) {
    sigImg = '<img src="data:image/png;base64,' + SIGNATURE_PNG + '" alt="ลายเซ็น">';
  }

  const html =
  '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><style>' +
  fontFace +
  '*{font-family:"Prompt","Sarabun",sans-serif;box-sizing:border-box;}' +
  'body{margin:0;padding:24px;color:#1a1a1a;font-size:12.5px;}' +
  '.sheet{border:1px solid #333;}' +
  '.pad{padding:10px 14px;}' +
  '.orig{float:right;border:1px solid #333;padding:4px 16px;font-weight:700;margin:-2px 0 6px 12px;}' +
  '.cname{font-weight:700;font-size:15px;color:#BC2B30;}' +
  '.lbl{color:#BC2B30;font-weight:700;}' +
  '.muted{color:#444;line-height:1.55;}' +
  '.hrow{display:table;width:100%;}' +
  '.hL{display:table-cell;vertical-align:top;}' +
  '.hR{display:table-cell;vertical-align:top;text-align:right;width:170px;white-space:nowrap;}' +
  '.title{background:#BC2B30;color:#fff;border-top:1px solid #8a2024;border-bottom:1px solid #8a2024;' +
    'text-align:center;font-weight:700;font-size:15px;padding:8px;letter-spacing:.5px;}' +
  '.cust{padding:8px 14px;border-bottom:1px solid #333;line-height:1.7;}' +
  'table.items{width:100%;border-collapse:collapse;}' +
  'table.items th{background:#f7e7c4;border:1px solid #333;padding:6px;font-size:12px;color:#7a1f22;}' +
  'table.items td{border-left:1px solid #333;border-right:1px solid #333;padding:6px 8px;}' +
  'table.items td .ck{display:inline-block;width:15px;height:15px;border:1.3px solid #555;border-radius:3px;vertical-align:middle;}' +
  'table.items tbody tr:last-child td{border-bottom:1px solid #333;}' +
  '.c{text-align:center;}.r{text-align:right;}' +
  '.sum{display:table;width:100%;}' +
  '.sumL{display:table-cell;vertical-align:top;width:55%;padding:8px 14px;}' +
  '.sumR{display:table-cell;vertical-align:top;width:45%;}' +
  'table.tot{width:100%;border-collapse:collapse;}' +
  'table.tot td{border:1px solid #333;padding:5px 10px;}' +
  'table.tot td.k{font-weight:600;background:#fdf4e1;}' +
  'table.tot td.v{text-align:right;width:110px;}' +
  'table.tot tr.grand td{font-weight:700;background:#BC2B30;color:#fff;}' +
  '.bahtbox{border:1px solid #BC2B30;background:#fdf4e1;text-align:center;font-weight:600;color:#7a1f22;padding:7px;margin-bottom:8px;}' +
  '.pay{padding:2px 0;}' +
  '.chk{display:inline-block;border:1px solid #333;width:14px;height:14px;text-align:center;line-height:13px;margin-right:4px;}' +
  '.note{color:#555;font-size:11px;margin-top:6px;}' +
  '.foot{display:table;width:100%;border-top:1px solid #333;}' +
  '.footL{display:table-cell;width:62%;padding:8px 14px;font-size:10.5px;color:#444;vertical-align:bottom;}' +
  '.footR{display:table-cell;width:38%;padding:8px 14px;text-align:center;vertical-align:bottom;}' +
  '.sigwrap{height:52px;text-align:center;overflow:hidden;}' +
  '.sigwrap img{max-height:58px;max-width:96%;margin-bottom:-6px;}' +
  '.sigline{border-top:1px solid #333;margin-top:0;padding-top:4px;}' +
  '</style></head><body><div class="sheet">' +

  // ===== หัวบริษัท =====
  '<div class="pad"><div class="orig">ต้นฉบับ</div>' +
    '<div class="hrow"><div class="hL">' +
      '<div class="cname">' + esc_(CONFIG.SHOP.name) + ' (' + esc_(CONFIG.SHOP.taxBranch) + ')</div>' +
      '<div class="muted">ที่อยู่ : ' + esc_(CONFIG.SHOP.address) + '<br>' +
      'เลขประจำตัวผู้เสียภาษีอากร : ' + esc_(CONFIG.SHOP.taxId) + '</div>' +
    '</div><div class="hR muted">' +
      '<div><span class="lbl">เลขที่บิล</span><br>' + esc_(invoice.billNo) + '</div>' +
      '<div style="margin-top:6px"><span class="lbl">วันที่</span><br>' + dateStr + '</div>' +
    '</div></div>' +
  '</div>' +

  '<div class="title">ใบเสร็จรับเงิน / ใบกำกับภาษี</div>' +

  // ===== ลูกค้า =====
  '<div class="cust">' +
    '<span class="lbl">ลูกค้า :</span> ' + esc_(invoice.customerName) + '<br>' +
    (invoice.phone ? '<span class="lbl">เบอร์โทร :</span> ' + esc_(invoice.phone) + '<br>' : '') +
    '<span class="lbl">ที่อยู่ :</span> ' + addrHtml + '<br>' +
    '<span class="lbl">เลขประจำตัวผู้เสียภาษีอากร :</span> ' + esc_(invoice.taxId) +
  '</div>' +

  // ===== รายการ =====
  '<table class="items"><thead><tr>' +
    '<th style="width:7%">ลำดับ</th><th>รายการ</th><th style="width:10%">จำนวน</th>' +
    '<th style="width:14%">ราคา</th><th style="width:15%">จำนวนเงิน</th>' +
    '<th style="width:8%">จัด<br>เสร็จ</th><th style="width:10%">ทวน<br>ออเดอร์</th>' +
  '</tr></thead><tbody>' + itemRows + blanks + '</tbody></table>' +

  // ===== สรุป =====
  '<div class="sum"><div class="sumL">' +
    '<div class="bahtbox">' + esc_(bahtText_(invoice.grandTotal)) + '</div>' +
    '<div class="pay"><b>ชำระโดย</b> <span class="chk">&#10003;</span> ' + esc_(invoice.paymentMethod) + '</div>' +
    '<div class="note">(ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ต่อเมื่อได้รับการชำระเงินเรียบร้อยแล้วเท่านั้น)</div>' +
  '</div><div class="sumR"><table class="tot">' +
    '<tr><td class="k">รวมทั้งสิ้น</td><td class="v">' + fmt_(invoice.gross) + '</td></tr>' +
    '<tr><td class="k">ส่วนลด</td><td class="v">' + fmt_(invoice.discount) + '</td></tr>' +
    '<tr><td class="k">คงเหลือ</td><td class="v">' + fmt_(round2_(invoice.gross - invoice.discount)) + '</td></tr>' +
    '<tr><td class="k">มูลค่าสุทธิ</td><td class="v">' + fmt_(invoice.net) + '</td></tr>' +
    '<tr><td class="k">ภาษีมูลค่าเพิ่ม Vat 7 %</td><td class="v">' + fmt_(invoice.vat) + '</td></tr>' +
    '<tr class="grand"><td class="k">รวมเป็นเงินทั้งสิ้น</td><td class="v">' + fmt_(invoice.grandTotal) + '</td></tr>' +
  '</table></div></div>' +

  // ===== ท้ายบิล =====
  '<div class="foot"><div class="footL">' +
    'หากต้องการแก้ไขใบเสร็จรับเงินหรือใบกำกับภาษี กรุณาติดต่อทางบริษัทฯ ภายใน 1 วันทำการ ' +
    'นับจากวันได้รับเอกสาร หากพ้นกำหนด ทางบริษัทฯ จะไม่รับผิดชอบใดๆทั้งสิ้น' +
  '</div><div class="footR">' +
    '<div class="sigwrap">' + sigImg + '</div>' +
    '<div class="sigline">ผู้รับเงิน / Collecter</div>' +
  '</div></div>' +

  '</div></body></html>';

  return Utilities.newBlob(html, 'text/html', 'bill.html')
    .getAs('application/pdf')
    .setName(invoice.billNo + '.pdf');
}

// ================= แปลงจำนวนเงินเป็นตัวอักษรไทย =================
function bahtText_(num) {
  num = round2_(num);
  const baht = Math.floor(num);
  const satang = Math.round((num - baht) * 100);
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน';
  let txt = '';
  if (baht > 0) txt += readThai_(baht) + 'บาท';
  txt += (satang > 0) ? (readThai_(satang) + 'สตางค์') : 'ถ้วน';
  return txt;
}
function readThai_(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'ศูนย์';
  let s = String(n);
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(s.length - 6);
    return readThai_(Number(head)) + 'ล้าน' + readSix_(tail);
  }
  return readSix_(s);
}
function readSix_(s) {
  const d = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const p = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  s = String(Number(s));
  const len = s.length;
  let r = '';
  for (let i = 0; i < len; i++) {
    const dig = Number(s.charAt(i));
    const place = len - i - 1;
    if (dig === 0) continue;
    if (place === 1) {
      r += (dig === 1) ? 'สิบ' : (dig === 2) ? 'ยี่สิบ' : d[dig] + 'สิบ';
    } else if (place === 0) {
      r += (dig === 1 && len > 1) ? 'เอ็ด' : d[dig];
    } else {
      r += d[dig] + p[place];
    }
  }
  return r;
}

// ================= ตรวจจับการตีกลับ (bounce) =================
function checkBounces() {
  const sh = ensureSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  const col = headerIndex_(data[0]);

  const pending = [];
  for (let r = 1; r < data.length; r++) {
    if (data[r][col.Status] === STATUS.SENDING) {
      pending.push({
        row: r + 1, billNo: data[r][col.BillNo],
        email: String(data[r][col.Email]).toLowerCase(),
        sentAt: data[r][col.SentAt] ? new Date(data[r][col.SentAt]) : new Date(data[r][col.Timestamp]),
      });
    }
  }
  if (!pending.length) return;

  const threads = GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:2d', 0, 50);
  const parts = [];
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      parts.push((m.getPlainBody() || '') + ' ' + (m.getSubject() || ''));
    });
  });
  const allBounce = parts.join('\n').toLowerCase();
  const now = new Date();

  pending.forEach(function (p) {
    const hit = (p.billNo && allBounce.indexOf(String(p.billNo).toLowerCase()) !== -1) ||
                (p.email && allBounce.indexOf(p.email) !== -1);
    if (hit) {
      updateRow_(sh, p.row, {
        Status: STATUS.FAILED, StatusDetail: 'พบการตีกลับ - อีเมลปลายทางอาจไม่มีอยู่จริง', LastUpdated: now,
      });
    } else if ((now - p.sentAt) / 60000 >= CONFIG.ASSUME_DELIVERED_AFTER_MIN) {
      updateRow_(sh, p.row, {
        Status: STATUS.DELIVERED,
        StatusDetail: 'ส่งถึงแล้ว (ไม่พบการตีกลับใน ' + CONFIG.ASSUME_DELIVERED_AFTER_MIN + ' นาที)',
        LastUpdated: now,
      });
    }
  });
}

// ================= ส่งซ้ำ (แก้อีเมลใหม่) =================
function resendInvoice(billNo, newEmail) {
  try {
    if (!newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
      return { ok: false, message: 'รูปแบบอีเมลใหม่ไม่ถูกต้อง' };
    }
    const sh = ensureSheet_();
    const data = sh.getDataRange().getValues();
    const col = headerIndex_(data[0]);
    const rowIdx = findRowByBill_(sh, billNo);
    if (rowIdx < 0) return { ok: false, message: 'ไม่พบบิลเลขที่นี้' };
    const r = rowIdx - 1;

    const invoice = {
      billNo: billNo,
      date: new Date(data[r][col.Timestamp]),
      customerName: data[r][col.CustomerName],
      taxId: data[r][col.TaxID],
      phone: data[r][col.CustomerPhone] || '',
      address: data[r][col.Address],
      email: newEmail.trim(),
      items: JSON.parse(data[r][col.ItemsJSON] || '[]'),
      paymentMethod: data[r][col.PaymentMethod],
      gross: Number(data[r][col.Gross]), discount: Number(data[r][col.Discount]),
      net: Number(data[r][col.Net]), vat: Number(data[r][col.VAT]),
      grandTotal: Number(data[r][col.GrandTotal]),
    };

    const result = sendInvoiceEmail_(invoice);
    const resendCount = Number(data[r][col.ResendCount] || 0) + 1;

    if (result.ok) {
      updateRow_(sh, rowIdx, {
        Email: newEmail.trim(), Status: STATUS.SENDING,
        StatusDetail: 'ส่งซ้ำแล้ว (ครั้งที่ ' + resendCount + ') รอตรวจการตีกลับ',
        SentAt: new Date(), LastUpdated: new Date(), ResendCount: resendCount,
      });
      return { ok: true, message: 'ส่งซ้ำไปที่ ' + newEmail + ' แล้ว' };
    } else {
      updateRow_(sh, rowIdx, {
        Email: newEmail.trim(), Status: STATUS.ERROR,
        StatusDetail: 'ส่งซ้ำไม่ออก: ' + result.message, LastUpdated: new Date(), ResendCount: resendCount,
      });
      return { ok: false, message: 'ส่งซ้ำไม่สำเร็จ: ' + result.message };
    }
  } catch (e) {
    return { ok: false, message: 'ผิดพลาด: ' + e.message };
  }
}

// ================= ยกเลิกการส่ง (void) =================
function cancelInvoice(billNo) {
  try {
    const sh = ensureSheet_();
    const rowIdx = findRowByBill_(sh, billNo);
    if (rowIdx < 0) return { ok: false, message: 'ไม่พบบิลเลขที่นี้' };
    updateRow_(sh, rowIdx, {
      Status: STATUS.CANCELLED,
      StatusDetail: 'ยกเลิกการส่งแล้ว เมื่อ ' +
        Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
      LastUpdated: new Date(),
    });
    return { ok: true, message: 'ยกเลิกบิล ' + billNo + ' แล้ว' };
  } catch (e) {
    return { ok: false, message: 'ผิดพลาด: ' + e.message };
  }
}

// ================= เรียกกลับ (จากยกเลิก -> ส่งไม่สำเร็จ) =================
function restoreInvoice(billNo) {
  try {
    const sh = ensureSheet_();
    const rowIdx = findRowByBill_(sh, billNo);
    if (rowIdx < 0) return { ok: false, message: 'ไม่พบบิลเลขที่นี้' };
    updateRow_(sh, rowIdx, {
      Status: STATUS.FAILED,
      StatusDetail: 'เรียกกลับมาที่ส่งไม่สำเร็จ เมื่อ ' +
        Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
      LastUpdated: new Date(),
    });
    return { ok: true, message: 'เรียกบิล ' + billNo + ' กลับมาที่ส่งไม่สำเร็จแล้ว' };
  } catch (e) {
    return { ok: false, message: 'ผิดพลาด: ' + e.message };
  }
}

// ================= ดึงข้อมูลบิลเต็ม (สำหรับแก้ไข) =================
function getInvoice(billNo) {
  const sh = ensureSheet_();
  const data = sh.getDataRange().getValues();
  const col = headerIndex_(data[0]);
  const idx = findRowByBill_(sh, billNo);
  if (idx < 0) return null;
  const r = idx - 1;
  return {
    billNo: billNo,
    branchPrefix: data[r][col.BranchPrefix],
    customerName: data[r][col.CustomerName] === '-' ? '' : data[r][col.CustomerName],
    taxId: data[r][col.TaxID] === '-' ? '' : data[r][col.TaxID],
    phone: data[r][col.CustomerPhone] || '',
    address: data[r][col.Address] === '-' ? '' : data[r][col.Address],
    email: data[r][col.Email],
    items: JSON.parse(data[r][col.ItemsJSON] || '[]'),
    discount: Number(data[r][col.Discount] || 0),
    paymentMethod: data[r][col.PaymentMethod] || '',
    status: data[r][col.Status],
  };
}

// ================= แก้ไขบิลเดิม + สร้าง PDF ใหม่ + ส่งใหม่ =================
function updateInvoice(billNo, payload) {
  try {
    if (!payload.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
      return { ok: false, message: 'รูปแบบอีเมลผู้รับไม่ถูกต้อง' };
    }
    if (!payload.items || !payload.items.length) {
      return { ok: false, message: 'ยังไม่มีรายการสินค้า/บริการ' };
    }
    if (!/^\d{13}$/.test(String(payload.taxId || ''))) {
      return { ok: false, message: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' };
    }
    const sh = ensureSheet_();
    const idx = findRowByBill_(sh, billNo);
    if (idx < 0) return { ok: false, message: 'ไม่พบบิลเลขที่นี้' };
    const data = sh.getDataRange().getValues();
    const col = headerIndex_(data[0]);
    const r = idx - 1;

    const totals = computeTotals_(payload.items, { discount: payload.discount });
    const invoice = {
      billNo: billNo,
      date: new Date(data[r][col.Timestamp]),               // คงวันที่เดิมของบิล
      customerName: payload.customerName || '-',
      taxId: payload.taxId || '-',
      phone: payload.phone || '',
      address: payload.address || '-',
      email: payload.email.trim(),
      items: payload.items,
      paymentMethod: payload.paymentMethod || 'เงินสด / QR Payment',
      gross: totals.gross, discount: totals.discount, net: totals.net,
      vat: totals.vat, grandTotal: totals.total,
    };

    updateRow_(sh, idx, {
      CustomerName: invoice.customerName, TaxID: invoice.taxId, CustomerPhone: invoice.phone,
      Address: invoice.address, Email: invoice.email, ItemsJSON: JSON.stringify(payload.items),
      Gross: totals.gross, Discount: totals.discount, Net: totals.net, VAT: totals.vat,
      GrandTotal: totals.total, PaymentMethod: invoice.paymentMethod,
    });

    // สร้าง PDF ใหม่ (ทับสำเนาเดิม) + ส่งอีเมลฉบับแก้ไข
    const result = sendInvoiceEmail_(invoice, true);
    if (result.ok) {
      updateRow_(sh, idx, {
        Status: STATUS.SENDING, StatusDetail: 'แก้ไขแล้ว ส่งใหม่ รอตรวจการตีกลับ',
        SentAt: new Date(), LastUpdated: new Date(), PdfUrl: result.pdfUrl || '',
      });
      return { ok: true, message: 'แก้ไขบิล ' + billNo + ' และส่งใหม่แล้ว' };
    } else {
      updateRow_(sh, idx, {
        Status: STATUS.ERROR, StatusDetail: 'แก้ไขแล้วแต่ส่งไม่ออก: ' + result.message,
        LastUpdated: new Date(), PdfUrl: result.pdfUrl || '',
      });
      return { ok: false, message: 'แก้ไขแล้วแต่ส่งไม่สำเร็จ: ' + result.message };
    }
  } catch (e) {
    return { ok: false, message: 'ผิดพลาด: ' + e.message };
  }
}

// ================= ดึงรายการให้หน้าเว็บ =================
function getInvoices() {
  const sh = ensureSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const col = headerIndex_(data[0]);
  const out = [];
  for (let r = data.length - 1; r >= 1; r--) {
    out.push({
      billNo: data[r][col.BillNo],
      date: Utilities.formatDate(new Date(data[r][col.Timestamp]), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
      customerName: data[r][col.CustomerName],
      email: data[r][col.Email],
      grandTotal: Number(data[r][col.GrandTotal]),
      status: data[r][col.Status],
      statusDetail: data[r][col.StatusDetail],
      resendCount: Number(data[r][col.ResendCount] || 0),
      pdfUrl: data[r][col.PdfUrl] || '',
    });
  }
  return out;
}

// ================= Helpers =================
function headerIndex_(headerRow) {
  const map = {}; headerRow.forEach(function (h, i) { map[h] = i; }); return map;
}
function findRowByBill_(sh, billNo) {
  const data = sh.getDataRange().getValues();
  const col = headerIndex_(data[0]);
  for (let r = 1; r < data.length; r++) if (data[r][col.BillNo] === billNo) return r + 1;
  return -1;
}
function updateRow_(sh, rowIndex, fields) {
  const col = headerIndex_(sh.getRange(1, 1, 1, HEADERS.length).getValues()[0]);
  Object.keys(fields).forEach(function (k) {
    if (col[k] !== undefined) sh.getRange(rowIndex, col[k] + 1).setValue(fields[k]);
  });
}
function fmt_(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
