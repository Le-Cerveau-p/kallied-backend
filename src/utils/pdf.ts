import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const buildPdfBuffer = (content: string) => {
  const lines = content.split(/\r?\n/).map((line) => escapePdfText(line));
  const lineHeight = 16;

  const textOps = [
    'BT',
    '/F1 12 Tf',
    '50 740 Td',
    ...lines.map((line, index) =>
      index === 0 ? `(${line}) Tj` : `0 -${lineHeight} Td (${line}) Tj`,
    ),
    'ET',
  ].join('\n');

  const stream = textOps;
  const streamLength = Buffer.byteLength(stream, 'utf8');

  const parts: string[] = [];
  let offset = 0;
  const offsets: number[] = [];

  const push = (text: string) => {
    parts.push(text);
    offset += Buffer.byteLength(text, 'utf8');
  };

  push('%PDF-1.4\n');

  const addObject = (id: number, body: string) => {
    offsets[id] = offset;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  );
  addObject(4, `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
  addObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const xrefOffset = offset;
  const objCount = 5;
  push(`xref\n0 ${objCount + 1}\n`);
  push('0000000000 65535 f \n');

  for (let i = 1; i <= objCount; i += 1) {
    const line = String(offsets[i]).padStart(10, '0');
    push(`${line} 00000 n \n`);
  }

  push(
    `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(parts.join(''), 'utf8');
};

export const createTempPdfFile = (content: string, baseName: string) => {
  const safeBase = baseName.replace(/[^a-z0-9-_]/gi, '_') || 'document';
  const filename = `${safeBase}.pdf`;
  const filePath = path.join(os.tmpdir(), `${safeBase}-${Date.now()}.pdf`);
  const pdfBuffer = buildPdfBuffer(content);

  fs.writeFileSync(filePath, pdfBuffer);

  return { filename, filePath };
};

export const cleanupTempFile = (filePath: string) => {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
};
