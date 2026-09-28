import { describe, expect, it } from 'vitest';

import {
  assertSafeDocument,
  chunkDocumentText,
  detectDocumentMime,
  extractDocumentText
} from './document-content.js';
import { createHash } from 'node:crypto';
import { deflateRawSync, deflateSync } from 'node:zlib';

const docxFixture = (xml: string): Buffer => {
  const name = Buffer.from('word/document.xml');
  const source = Buffer.from(xml);
  const compressed = deflateRawSync(source);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralOffset = local.length + name.length + compressed.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, compressed, central, name, eocd]);
};

const pdfFixture = (operator: string, compressed = false): Buffer => {
  const source = Buffer.from(`BT /F1 12 Tf 72 720 Td ${operator} ET\n`, 'latin1');
  const stream = compressed ? deflateSync(source) : source;
  const filter = compressed ? ' /Filter /FlateDecode' : '';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      'latin1'
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length}${filter} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from('\nendstream', 'latin1')
    ])
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  let length = parts[0]!.length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const entry = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      object,
      Buffer.from('\nendobj\n', 'latin1')
    ]);
    parts.push(entry);
    length += entry.length;
  }
  const xref = length;
  parts.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      'latin1'
    )
  );
  return Buffer.concat(parts);
};

describe('private document validation pipeline', () => {
  it('validates checksum and MIME before extracting UTF-8 text', async () => {
    const content = Buffer.from('Jam layanan Senin sampai Jumat, pukul 08.00–16.00.', 'utf8');
    const digest = createHash('sha256').update(content).digest('hex');
    expect(detectDocumentMime(content)).toBe('text/plain');
    const mime = assertSafeDocument(content, 'text/plain', digest);
    expect(await extractDocumentText(content, mime)).toContain('Jam layanan');
  });

  it.each([
    ['wrong signature', Buffer.from('%PDF-1.4\n(hello) Tj'), 'text/plain', 'MIME_MISMATCH'],
    [
      'malware signature',
      Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE'),
      'text/plain',
      'MALWARE_DETECTED'
    ]
  ])('rejects %s before extraction', (_name, content, declared, code) => {
    const digest = createHash('sha256').update(content).digest('hex');
    expect(() => assertSafeDocument(content, declared, digest)).toThrow(code);
  });

  it('creates deterministic overlapping chunks without duplicates', () => {
    const text = Array.from({ length: 150 }, (_, index) => `kalimat-${index}`).join(' ');
    const first = chunkDocumentText(text, 180, 30);
    const second = chunkDocumentText(text, 180, 30);
    expect(first).toEqual(second);
    expect(new Set(first.map(({ contentHash }) => contentHash)).size).toBe(first.length);
    expect(first.every(({ tokenEstimate }) => tokenEstimate > 0)).toBe(true);
  });

  it('does not skip text when a whitespace boundary shortens a chunk', () => {
    const longPrefix = 'A'.repeat(1_000);
    const longToken = 'B'.repeat(700);
    const chunks = chunkDocumentText(`${longPrefix} ${longToken}`, 1_600, 200);

    expect(chunks.map(({ content }) => content.length)).toEqual([1_000, 901]);
    expect(chunks.some(({ content }) => content.includes(longPrefix))).toBe(true);
    expect(chunks.some(({ content }) => content.includes(longToken))).toBe(true);
  });

  it.each([
    ['literal Tj', '(RAHO) Tj', false],
    ['array TJ', '[(RAHO) -250 (Premier)] TJ', false],
    ['hexadecimal Tj', '<5241484f> Tj', false],
    ['compressed array TJ', '[(RAHO) -250 (Premier)] TJ', true]
  ])('extracts PDF text using %s', async (_name, operator, compressed) => {
    const text = await extractDocumentText(pdfFixture(operator, compressed), 'application/pdf');
    expect(text).toContain('RAHO');
    if (operator.includes('Premier')) expect(text).toContain('Premier');
  });

  it('rejects active PDF content and PDFs without a text layer', async () => {
    const active = Buffer.concat([
      pdfFixture('(RAHO) Tj'),
      Buffer.from('\n% /JavaScript is not accepted', 'latin1')
    ]);

    await expect(extractDocumentText(active, 'application/pdf')).rejects.toThrow(
      'PDF_ACTIVE_CONTENT'
    );
    await expect(extractDocumentText(pdfFixture(''), 'application/pdf')).rejects.toThrow(
      'PDF_TEXT_UNAVAILABLE'
    );
  });

  it('extracts a supported DOCX container', async () => {
    const docx = docxFixture(
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Layanan DOCX terverifikasi</w:t></w:r></w:p></w:body></w:document>'
    );
    expect(
      await extractDocumentText(
        docx,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toContain('Layanan DOCX');
  });
});
