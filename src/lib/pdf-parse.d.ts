declare module "pdf-parse" {
  export interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  import type { PdfParseResult } from "pdf-parse";

  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdfParse;
}
