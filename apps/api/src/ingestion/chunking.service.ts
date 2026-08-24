import { Injectable } from '@nestjs/common';
import { getEncoding } from 'js-tiktoken';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}
export interface TextChunk {
  articleReference?: string;
  chunkContent: string;
  chunkIndex: number;
  numeralReference?: string;
  pageEnd: number;
  pageStart: number;
  sectionTitle?: string;
  tokenCount: number;
}

const MAX_TOKENS = 800;
const OVERLAP_TOKENS = 100;

@Injectable()
export class ChunkingService {
  private readonly encoding = getEncoding('o200k_base');

  chunk(pages: ExtractedPage[]): TextChunk[] {
    const chunks: TextChunk[] = [];
    let units: { content: string; pageNumber: number }[] = [];
    const flush = () => {
      if (!units.length) return;
      const content = units.map((unit) => unit.content).join('\n\n');
      const tokens = this.encoding.encode(content);
      const first = units[0];
      const last = units.at(-1)!;
      chunks.push({
        articleReference: content.match(/art[ií]culo\s+([\w.-]+)/i)?.[0],
        chunkContent: content,
        chunkIndex: chunks.length,
        numeralReference: content.match(/(?:^|\s)(\d+(?:\.\d+)+)\.?\s/)?.[1],
        pageEnd: last.pageNumber,
        pageStart: first.pageNumber,
        sectionTitle: content.match(
          /^(?:cap[ií]tulo|art[ií]culo).{1,240}/im,
        )?.[0],
        tokenCount: tokens.length,
      });
      const overlap: typeof units = [];
      let count = 0;
      for (const unit of [...units].reverse()) {
        const size = this.encoding.encode(unit.content).length;
        if (count + size > OVERLAP_TOKENS && overlap.length) break;
        overlap.unshift(unit);
        count += size;
      }
      units = overlap;
    };

    for (const page of pages) {
      for (const raw of page.text.split(/\n{2,}|(?<=\.)\s{2,}/)) {
        const content = raw
          .replaceAll(String.fromCharCode(0), '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!content) continue;
        const tokens = this.encoding.encode(content);
        if (tokens.length > MAX_TOKENS) {
          flush();
          for (
            let start = 0;
            start < tokens.length;
            start += MAX_TOKENS - OVERLAP_TOKENS
          ) {
            units = [
              {
                content: this.encoding.decode(
                  tokens.slice(start, start + MAX_TOKENS),
                ),
                pageNumber: page.pageNumber,
              },
            ];
            flush();
          }
        } else {
          const current = units.reduce(
            (total, unit) => total + this.encoding.encode(unit.content).length,
            0,
          );
          if (current + tokens.length > MAX_TOKENS && units.length) flush();
          units.push({ content, pageNumber: page.pageNumber });
        }
      }
    }
    flush();
    return chunks;
  }
}
