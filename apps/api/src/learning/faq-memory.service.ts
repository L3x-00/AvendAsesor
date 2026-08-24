import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FaqMemoryObservation {
  questionFingerprint: string;
}

const FAQ_CANONICAL_QUESTION_MAX_LENGTH = 1_000;
const FAQ_CANONICAL_QUESTION_MIN_LENGTH = 4;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}/gi;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const PERU_PHONE_PATTERN = /\b(?:\+?51[\s.-]*)?9(?:[\s.-]*\d){8}\b/g;
const IDENTIFIED_DNI_PATTERN =
  /\b(?:dni|documento(?:\s+de\s+identidad)?|carn[eé](?:\s+de\s+extranjer[ií]a)?|ruc)[\s:#-]*(?:\d[\s./-]*){8,12}\b/gi;
const NUMERIC_IDENTIFIER_PATTERN = /\b\d{8,}\b/g;
const SEPARATED_IDENTIFIER_PATTERN = /\b\d{2,4}(?:[ ./-]\d{2,4}){1,3}\b/g;
const SECRET_INTENT_PATTERN =
  /\b(?:contrase(?:ñ|n)a|password|api[\s_-]?key|token de acceso|clave secreta)\b/i;
const PLACEHOLDER_ONLY_PATTERN =
  /\[(?:correo|enlace|teléfono|documento de identidad|identificador numérico)\]/g;

function redactCommonPersonalData(question: string): string {
  return question
    .replace(EMAIL_PATTERN, '[correo]')
    .replace(URL_PATTERN, '[enlace]')
    .replace(PERU_PHONE_PATTERN, '[teléfono]')
    .replace(IDENTIFIED_DNI_PATTERN, '[documento de identidad]')
    .replace(SEPARATED_IDENTIFIER_PATTERN, (value) => {
      const digitCount = value.replace(/\D/g, '').length;
      const isIsoDate = /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value);

      return digitCount >= 8 && !isIsoDate ? '[identificador numérico]' : value;
    })
    .replace(NUMERIC_IDENTIFIER_PATTERN, '[identificador numérico]');
}

function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class FaqMemoryService {
  constructor(private readonly configService: ConfigService) {}

  prepare(question: string): FaqMemoryObservation | null {
    const fingerprintSecret = this.configService.get<string>(
      'FAQ_MEMORY_FINGERPRINT_SECRET',
    );
    if (!fingerprintSecret) {
      return null;
    }

    if (SECRET_INTENT_PATTERN.test(question)) {
      return null;
    }

    const canonicalQuestion = normalizeWhitespace(
      redactCommonPersonalData(question),
    );
    const contentLength = canonicalQuestion
      .replace(PLACEHOLDER_ONLY_PATTERN, '')
      .trim().length;

    if (
      canonicalQuestion.length > FAQ_CANONICAL_QUESTION_MAX_LENGTH ||
      contentLength < FAQ_CANONICAL_QUESTION_MIN_LENGTH
    ) {
      return null;
    }

    return {
      questionFingerprint: createHmac('sha256', fingerprintSecret)
        .update(`faq-memory-v1:${canonicalQuestion.toLocaleLowerCase('es-PE')}`)
        .digest('hex'),
    };
  }
}
