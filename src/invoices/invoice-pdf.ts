import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const FONT_PATH = path.join(
  process.cwd(),
  './src/assets/fonts/NotoSans-Regular.ttf',
);

const THEME = {
  primary: '#001f54',
  accent: '#4169e1',
  highlight: '#a7fc00',
  muted: '#6b7280',
  border: '#e5e7eb',
};

const formatMoney = (value: number) => `${value.toLocaleString()}`;

const formatDate = (value?: Date | string | null) => {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const collectPdfBuffer = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

const ensureUploadsDir = (relativeDir: string) => {
  const safeDir = relativeDir.replace(/^\/+/, '');
  const dirPath = path.join(process.cwd(), 'uploads', safeDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

export const resolveUploadsPath = (fileUrl: string) => {
  const safeUrl = fileUrl.replace(/^\/+/, '');
  return path.join(process.cwd(), safeUrl);
};

export const writePdfToUploads = async (
  relativeDir: string,
  filename: string,
  buffer: Buffer,
) => {
  const dirPath = ensureUploadsDir(relativeDir);
  const filePath = path.join(dirPath, filename);
  await fs.promises.writeFile(filePath, buffer);
  const safeDir = relativeDir.replace(/^\/+/, '');
  const fileUrl = `/uploads/${safeDir}/${filename}`.replace(/\/{2,}/g, '/');
  return { filePath, fileUrl };
};

export async function buildInvoicePdf(invoice: any) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.font(FONT_PATH);
  const bufferPromise = collectPdfBuffer(doc);

  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;

  doc.rect(0, 0, doc.page.width, 110).fill(THEME.primary);
  doc.fillColor('white').fontSize(22).text('K-Allied', startX, 32);
  doc.fontSize(12).text('Invoice', startX, 62);

  doc
    .fillColor('white')
    .fontSize(11)
    .text(`Invoice #: ${invoice.invoiceNumber}`, startX + 300, 32, {
      width: pageWidth - 300,
      align: 'right',
    })
    .text(`Issue Date: ${formatDate(invoice.issueDate)}`, startX + 300, 50, {
      width: pageWidth - 300,
      align: 'right',
    })
    .text(`Due Date: ${formatDate(invoice.dueDate)}`, startX + 300, 68, {
      width: pageWidth - 300,
      align: 'right',
    });

  doc.moveDown(2.5);
  doc.fillColor(THEME.primary).fontSize(12).text('Bill To', startX, 130);
  doc
    .fillColor(THEME.muted)
    .fontSize(11)
    .text(invoice.client?.name ?? 'Client', startX, 148)
    .text(invoice.client?.email ?? 'N/A', startX, 164);

  doc
    .fillColor(THEME.primary)
    .fontSize(12)
    .text('Project', startX + 300, 130, { align: 'right' });
  doc
    .fillColor(THEME.muted)
    .fontSize(11)
    .text(invoice.project?.name ?? 'N/A', startX + 300, 148, {
      width: pageWidth - 300,
      align: 'right',
    });

  const tableTop = 210;
  const tablePadding = 8;
  const tableWidth = pageWidth - tablePadding * 2;
  const col = {
    description: Math.floor(tableWidth * 0.52),
    qty: Math.floor(tableWidth * 0.12),
    rate: Math.floor(tableWidth * 0.18),
    amount: 0,
  };
  col.amount = tableWidth - (col.description + col.qty + col.rate);
  const rowPadding = 6;

  doc.fillColor(THEME.accent).rect(startX, tableTop, pageWidth, 26).fill();
  doc
    .fillColor('white')
    .fontSize(10)
    .text('Description', startX + tablePadding, tableTop + 7, {
      width: col.description,
    })
    .text('Qty', startX + tablePadding + col.description, tableTop + 7, {
      width: col.qty,
      align: 'center',
    })
    .text(
      'Rate',
      startX + tablePadding + col.description + col.qty,
      tableTop + 7,
      {
        width: col.rate,
        align: 'right',
      },
    )
    .text(
      'Amount',
      startX + tablePadding + col.description + col.qty + col.rate,
      tableTop + 7,
      { width: col.amount, align: 'right' },
    );

  let y = tableTop + 36;
  doc.fillColor('#111827').fontSize(10);

  invoice.lineItems?.forEach((item: any) => {
    const descHeight = doc.heightOfString(item.description ?? '', {
      width: col.description,
    });
    const rowHeight = Math.max(descHeight, 12) + rowPadding;

    if (y + rowHeight > doc.page.height - 180) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc
      .fillColor('#111827')
      .text(item.description ?? '-', startX + tablePadding, y, {
        width: col.description,
      })
      .text(
        `${item.quantity ?? 0}`,
        startX + tablePadding + col.description,
        y,
        {
          width: col.qty,
          align: 'center',
        },
      )
      .text(
        formatMoney(item.rate ?? 0),
        startX + tablePadding + col.description + col.qty,
        y,
        {
          width: col.rate,
          align: 'right',
        },
      )
      .text(
        `₦${formatMoney(item.amount ?? 0)}`,
        startX + tablePadding + col.description + col.qty + col.rate,
        y,
        { width: col.amount, align: 'right' },
      );

    doc
      .strokeColor(THEME.border)
      .lineWidth(1)
      .moveTo(startX, y + rowHeight)
      .lineTo(startX + pageWidth, y + rowHeight)
      .stroke();

    y += rowHeight + 4;
  });

  const summaryTop = Math.max(y + 20, doc.page.height - 210);
  const summaryX = startX + pageWidth - 220;

  doc
    .fillColor(THEME.primary)
    .fontSize(11)
    .text('Subtotal', summaryX, summaryTop, { width: 120, align: 'left' })
    .text(
      `₦${formatMoney(invoice.subtotal ?? 0)}`,
      summaryX + 100,
      summaryTop,
      {
        width: 120,
        align: 'right',
      },
    );
  doc
    .fillColor(THEME.primary)
    .text('Tax', summaryX, summaryTop + 18, { width: 120, align: 'left' })
    .text(
      `₦${formatMoney(invoice.tax ?? 0)}`,
      summaryX + 100,
      summaryTop + 18,
      {
        width: 120,
        align: 'right',
      },
    );

  doc
    .moveTo(summaryX, summaryTop + 42)
    .lineTo(summaryX + 200, summaryTop + 42)
    .strokeColor(THEME.border)
    .stroke();

  doc
    .fillColor(THEME.accent)
    .fontSize(13)
    .text('Total', summaryX, summaryTop + 52, { width: 120, align: 'left' })
    .text(
      `₦${formatMoney(invoice.total ?? 0)}`,
      summaryX + 100,
      summaryTop + 52,
      {
        width: 120,
        align: 'right',
      },
    );

  if (invoice.notes) {
    doc
      .fillColor(THEME.primary)
      .fontSize(11)
      .text('Notes', startX, summaryTop - 10);
    doc
      .fillColor(THEME.muted)
      .fontSize(10)
      .text(invoice.notes, startX, summaryTop + 6, { width: 320 });
  }

  doc
    .fillColor(THEME.muted)
    .fontSize(9)
    .text('Thank you for your business.', startX, doc.page.height - 60);

  doc.end();
  return bufferPromise;
}

export async function buildReceiptPdf(invoice: any) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.font(FONT_PATH);
  const bufferPromise = collectPdfBuffer(doc);
  const startX = doc.page.margins.left;

  doc.rect(0, 0, doc.page.width, 110).fill(THEME.primary);
  doc.fillColor('white').fontSize(22).text('K-Allied', startX, 32);
  doc.fontSize(12).text('Payment Receipt', startX, 62);

  doc
    .fillColor('white')
    .fontSize(11)
    .text(`Invoice #: ${invoice.invoiceNumber}`, startX + 300, 32, {
      width: 200,
      align: 'right',
    })
    .text(
      `Paid Date: ${formatDate(invoice.paidAt ?? invoice.paymentConfirmedAt)}`,
      startX + 300,
      50,
      {
        width: 200,
        align: 'right',
      },
    );

  doc.moveDown(2.5);
  doc
    .fillColor(THEME.primary)
    .fontSize(12)
    .text('Receipt Details', startX, 130);
  doc
    .fillColor(THEME.muted)
    .fontSize(11)
    .text(`Client: ${invoice.client?.name ?? 'Client'}`, startX, 150)
    .text(`Project: ${invoice.project?.name ?? 'N/A'}`, startX, 168)
    .text(`Total Paid: ₦${formatMoney(invoice.total ?? 0)}`, startX, 186);

  doc
    .fillColor(THEME.highlight)
    .rect(startX, 230, doc.page.width - startX * 2, 60)
    .fill();
  doc
    .fillColor(THEME.primary)
    .fontSize(16)
    .text('Payment Received', startX + 18, 248);

  doc
    .fillColor(THEME.muted)
    .fontSize(10)
    .text('This receipt confirms payment for the invoice above.', startX, 320);

  doc
    .fillColor(THEME.muted)
    .fontSize(9)
    .text('If you have any questions, contact our billing team.', startX, 360);

  doc.end();
  return bufferPromise;
}
