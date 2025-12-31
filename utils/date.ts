import { format, parse } from "@std/datetime";

// Common date formats for auto-detection (EU formats only)
export const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "dd.MM.yyyy",
  "yyyy/MM/dd",
];

export function tryParseDate(value: string, formatStr: string): Date | null {
  if (!value || !formatStr) return null;
  try {
    return parse(value, formatStr);
  } catch {
    return null;
  }
}

export function transformDate(
  value: string,
  sourceFormat: string,
  targetFormat: string,
): string {
  const date = tryParseDate(value, sourceFormat);
  if (!date) return "";
  return format(date, targetFormat);
}

export function parseDateAutoDetect(value: string): Date | null {
  if (!value) return null;

  // Try each EU format until one works
  for (const formatStr of DATE_FORMATS) {
    const date = tryParseDate(value, formatStr);
    if (date) return date;
  }

  return null;
}

export function formatDateAutoDetect(
  value: string,
  targetFormat: string,
): string {
  const date = parseDateAutoDetect(value);
  if (!date) return "";
  return format(date, targetFormat);
}
