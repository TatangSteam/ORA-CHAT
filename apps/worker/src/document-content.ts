import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_DOCUMENT_BYTES = 10_485_760;
export const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_PDF_PAGES = 2_000;

export type SupportedMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain';

export const detectDocumentMime = (content: Buffer): SupportedMime | null => {
  if (content.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (content[0] === 0x50 && content[1] === 0x4b) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (!content.includes(0) && new TextDecoder('utf-8', { fatal: true }).decode(content)) {
    return 'text/plain';
  }
  return null;
};

const decodeXml = (value: string): string =>
  value
    .replace(/<w:tab\/?\s*>/gu, '\t')
    .replace(/<w:br\/?\s*>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");

const extractDocxXml = (content: Buffer): string => {
  let eocd = -1;
  for (
    let offset = content.length - 22;
    offset >= Math.max(0, content.length - 65_557);
    offset -= 1
  ) {
    if (content.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('ARCHIVE_DIRECTORY_MISSING');
  const entries = content.readUInt16LE(eocd + 10);
  if (entries > 2_000) throw new Error('ARCHIVE_TOO_MANY_ENTRIES');
  let offset = content.readUInt32LE(eocd + 16);
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > content.length || content.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ARCHIVE_DIRECTORY_INVALID');
    }
    const flags = content.readUInt16LE(offset + 8);
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const uncompressedSize = content.readUInt32LE(offset + 24);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const localOffset = content.readUInt32LE(offset + 42);
    if ((flags & 0x01) !== 0) throw new Error('ARCHIVE_ENCRYPTED');
    const nameStart = offset + 46;
    const name = content.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (localOffset + 30 > content.length || content.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ARCHIVE_LOCAL_HEADER_INVALID');
    }
    const localNameLength = content.readUInt16LE(localOffset + 26);
    const localExtraLength = content.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > content.length || uncompressedSize > MAX_DOCUMENT_BYTES * 5) {
      throw new Error('ARCHIVE_LIMIT_EXCEEDED');
    }
    if (name === 'word/document.xml') {
      const compressed = content.subarray(dataStart, dataEnd);
      const xml =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: MAX_DOCUMENT_BYTES * 5 })
            : (() => {
                throw new Error('ARCHIVE_COMPRESSION_UNSUPPORTED');
              })();
      if (compressed.length > 0 && xml.length / compressed.length > 100) {
        throw new Error('ARCHIVE_RATIO_EXCEEDED');
      }
      return decodeXml(xml.toString('utf8'));
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  throw new Error('DOCX_DOCUMENT_XML_MISSING');
};

const extractPdfText = async (content: Buffer): Promise<string> => {
  const raw = content.toString('latin1');
  if (/\/JavaScript|\/JS|\/Launch|\/EmbeddedFile/iu.test(raw)) {
    throw new Error('PDF_ACTIVE_CONTENT');
  }
  const loadingTask = getDocument({
    data: new Uint8Array(content),
    disableFontFace: true,
    enableXfa: false,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    maxImageSize: 0,
    stopAtErrors: true,
    useSystemFonts: false,
    useWasm: false,
    useWorkerFetch: false,
    verbosity: 0
  });
  try {
    const document = await loadingTask.promise;
    const [attachments, javaScript] = await Promise.all([
      document.getAttachments(),
      document.getJSActions()
    ]);
    if (attachments || javaScript) throw new Error('PDF_ACTIVE_CONTENT');
    if (document.numPages > MAX_PDF_PAGES) throw new Error('PDF_PAGE_LIMIT_EXCEEDED');
    const pages: string[] = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent({ disableNormalization: false });
      const pageText = textContent.items
        .flatMap((item) => ('str' in item && item.str ? [item.str] : []))
        .join(' ');
      extractedCharacters += pageText.length;
      if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
        throw new Error('EXTRACTED_TEXT_TOO_LARGE');
      }
      if (pageText) pages.push(pageText);
      page.cleanup();
    }
    if (pages.length === 0) throw new Error('PDF_TEXT_UNAVAILABLE');
    return pages.join('\n');
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'EXTRACTED_TEXT_TOO_LARGE',
        'PDF_ACTIVE_CONTENT',
        'PDF_PAGE_LIMIT_EXCEEDED',
        'PDF_TEXT_UNAVAILABLE'
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error('PDF_STREAM_INVALID', { cause: error });
  } finally {
    await loadingTask.destroy();
  }
};

export const cleanDocumentText = (value: string): string => {
  const withoutControls = [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127 ? ' ' : character;
    })
    .join('');
  const cleaned = withoutControls
    .normalize('NFKC')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (!cleaned) throw new Error('EMPTY_DOCUMENT');
  if (cleaned.length > MAX_EXTRACTED_CHARACTERS) throw new Error('EXTRACTED_TEXT_TOO_LARGE');
  return cleaned;
};

export const extractDocumentText = async (
  content: Buffer,
  mime: SupportedMime
): Promise<string> => {
  const raw =
    mime === 'text/plain'
      ? new TextDecoder('utf-8', { fatal: true }).decode(content)
      : mime === 'application/pdf'
        ? await extractPdfText(content)
        : extractDocxXml(content);
  return cleanDocumentText(raw);
};

export interface ContentChunk {
  sequence: number;
  content: string;
  contentHash: string;
  tokenEstimate: number;
}

export const chunkDocumentText = (text: string, size = 1_600, overlap = 200): ContentChunk[] => {
  if (overlap < 0 || size <= overlap) throw new Error('INVALID_CHUNK_CONFIGURATION');
  const chunks: ContentChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start + Math.floor(size / 2)) end = boundary;
    }
    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({
        sequence: chunks.length,
        content,
        contentHash: createHash('sha256').update(content).digest('hex'),
        tokenEstimate: Math.ceil(content.length / 4)
      });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
};

export const assertSafeDocument = (
  content: Buffer,
  declaredMime: string,
  expectedSha256: string
): SupportedMime => {
  if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) throw new Error('INVALID_SIZE');
  if (content.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE', 'ascii'))) {
    throw new Error('MALWARE_DETECTED');
  }
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (actualHash !== expectedSha256) throw new Error('CHECKSUM_MISMATCH');
  const detected = detectDocumentMime(content);
  if (!detected || detected !== declaredMime) throw new Error('MIME_MISMATCH');
  return detected;
};
