/** An in-memory file for a file picker (Playwright's setInputFiles payload). */
export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const jpg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

const pdf = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/**
 * Small synthetic invoices, named with the QA-AUTO prefix. They are generated in memory, so no
 * real document or personal data is ever uploaded.
 */
export function validInvoice(kind: 'png' | 'jpg' | 'jpeg' | 'pdf', stamp: string): TestFile {
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf' };
  const content = { png, jpg, jpeg: jpg, pdf }[kind];
  return { name: `QA-AUTO-invoice-${stamp}.${kind}`, mimeType: mime[kind], buffer: content };
}

/** Files the page must refuse: the extension is not PNG, JPG, JPEG or PDF. */
export function unsupportedInvoices(stamp: string): { name: string; file: TestFile }[] {
  const make = (extension: string, mimeType: string, text: string) => ({
    name: `a .${extension} file`,
    file: { name: `QA-AUTO-invoice-${stamp}.${extension}`, mimeType, buffer: Buffer.from(text) },
  });
  return [
    make('txt', 'text/plain', 'not an invoice'),
    make('exe', 'application/octet-stream', 'MZ not a program'),
    make(
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'not a document',
    ),
    make('gif', 'image/gif', 'GIF89a'),
    make('svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    make('pdf.exe', 'application/pdf', '%PDF-1.1'),
  ];
}
