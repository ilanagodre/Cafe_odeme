const {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} = require("node-thermal-printer");
const logger = require("../config/logger");

function createPrinter(host, port = 9100) {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${host}:${port}`,
    characterSet: CharacterSet.PC857_LATIN5,
    width: 42,
    options: { timeout: 3000 },
  });
}

function formatLine(left, right, width = 42) {
  const gap = width - left.length - right.length;
  return left + " ".repeat(Math.max(1, gap)) + right;
}

async function printReceipt({
  tableNumber,
  orders,
  totalBill,
  paidAmount,
  paymentType,
  cafeName,
}) {
  const host = process.env.RECEIPT_PRINTER_HOST;
  if (!host)
    throw new Error("Fiş yazıcısı yapılandırılmamış (RECEIPT_PRINTER_HOST)");

  const port = parseInt(process.env.RECEIPT_PRINTER_PORT || "9100");
  const printer = createPrinter(host, port);

  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error("Fiş yazıcısına bağlanılamadı");

  const now = new Date();

  printer.alignCenter();
  printer.bold(true);
  printer.println(cafeName || process.env.CAFE_NAME || "KAFE");
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Masa: ${tableNumber}`);
  printer.println(`Tarih: ${now.toLocaleDateString("tr-TR")}`);
  printer.println(
    `Saat:  ${now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`,
  );
  printer.drawLine();

  for (const order of orders) {
    const label = `${order.quantity}x ${order.name}`;
    const price = `${parseFloat(order.total_price).toFixed(2)}TL`;
    printer.println(formatLine(label, price));
  }

  printer.drawLine();
  printer.bold(true);
  printer.println(
    formatLine("TOPLAM:", `${parseFloat(totalBill).toFixed(2)}TL`),
  );
  printer.bold(false);

  if (paidAmount !== undefined) {
    printer.println(
      formatLine("ODENEN:", `${parseFloat(paidAmount).toFixed(2)}TL`),
    );
  }

  if (paymentType) {
    const types = {
      cash: "Nakit",
      transfer: "Havale",
      credit_card: "Kredi Karti",
      iyzico_3ds: "Kart",
      other: "Diger",
    };
    printer.println(`Odeme: ${types[paymentType] || paymentType}`);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println("Tesekkurler!");
  printer.println("Afiyet olsun :)");
  printer.newLine();
  printer.cut();

  await printer.execute();
  printer.clear();
  logger.info(`[Printer] Fis yazdirildi: Masa ${tableNumber}`);
}

async function printOrderSlip({ tableNumber, orders, participantName }) {
  const host = process.env.KITCHEN_PRINTER_HOST;
  if (!host)
    throw new Error("Mutfak yazıcısı yapılandırılmamış (KITCHEN_PRINTER_HOST)");

  const port = parseInt(process.env.KITCHEN_PRINTER_PORT || "9100");
  const printer = createPrinter(host, port);

  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error("Mutfak yazıcısına bağlanılamadı");

  const now = new Date();

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println("MUTFAK SIPARISI");
  printer.setTextNormal();
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Masa: ${tableNumber}`);
  printer.println(
    `Saat: ${now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`,
  );
  if (participantName) printer.println(`Siparis veren: ${participantName}`);
  printer.drawLine();

  for (const order of orders) {
    printer.bold(true);
    printer.println(`[${order.quantity}x] ${order.name}`);
    printer.bold(false);
  }

  printer.newLine();
  printer.partialCut();

  await printer.execute();
  printer.clear();
  logger.info(`[Printer] Mutfak fisi yazdirildi: Masa ${tableNumber}`);
}

async function testPrinter(type = "receipt") {
  const host =
    type === "kitchen"
      ? process.env.KITCHEN_PRINTER_HOST
      : process.env.RECEIPT_PRINTER_HOST;

  if (!host)
    throw new Error(
      `${type === "kitchen" ? "Mutfak" : "Fiş"} yazıcısı yapılandırılmamış`,
    );

  const port = parseInt(
    (type === "kitchen"
      ? process.env.KITCHEN_PRINTER_PORT
      : process.env.RECEIPT_PRINTER_PORT) || "9100",
  );

  const printer = createPrinter(host, port);
  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error("Yazıcıya bağlanılamadı");

  printer.alignCenter();
  printer.bold(true);
  printer.println("--- TEST ---");
  printer.bold(false);
  printer.println(type === "kitchen" ? "MUTFAK YAZICISI" : "FIS YAZICISI");
  printer.println(new Date().toLocaleString("tr-TR"));
  printer.newLine();
  printer.cut();

  await printer.execute();
  printer.clear();
}

module.exports = { printReceipt, printOrderSlip, testPrinter };
