import { describe, expect, it } from 'vitest';

import {
  assertSafeDocument,
  chunkDocumentText,
  detectDocumentMime,
  extractDocumentText
} from './document-content.js';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

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

describe('private document validation pipeline', () => {
  it('validates checksum and MIME before extracting UTF-8 text', () => {
    const content = Buffer.from('Jam layanan Senin sampai Jumat, pukul 08.00–16.00.', 'utf8');
    const digest = createHash('sha256').update(content).digest('hex');
    expect(detectDocumentMime(content)).toBe('text/plain');
    const mime = assertSafeDocument(content, 'text/plain', digest);
    expect(extractDocumentText(content, mime)).toContain('Jam layanan');
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

  it('extracts supported PDF and DOCX containers', () => {
    const pdf = Buffer.from('%PDF-1.4\nBT (Layanan PDF terverifikasi) Tj ET\n%%EOF', 'latin1');
    expect(extractDocumentText(pdf, 'application/pdf')).toContain('Layanan PDF');
    const docx = docxFixture(
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Layanan DOCX terverifikasi</w:t></w:r></w:p></w:body></w:document>'
    );
    expect(
      extractDocumentText(
        docx,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toContain('Layanan DOCX');
  });
});
