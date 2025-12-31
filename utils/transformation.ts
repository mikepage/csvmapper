import { formatDateAutoDetect, transformDate } from "./date.ts";
import {
  formatNumber,
  parseNumber,
  type Conversion,
  type DataType,
  type DecimalSeparator,
} from "./mapping.ts";

export function transformValue(
  value: string,
  sourceType: DataType,
  conversions: Conversion[],
  decimalSeparator: DecimalSeparator = ".",
): string {
  for (const conv of conversions) {
    if (conv.sourceValue.toLowerCase() === value.toLowerCase()) {
      return conv.targetValue;
    }
  }

  switch (sourceType) {
    case "boolean": {
      const lower = value.toLowerCase();
      if (["true", "t", "yes", "y", "1"].includes(lower)) return "true";
      if (["false", "f", "no", "n", "0"].includes(lower)) return "false";
      return value;
    }
    case "integer": {
      const num = parseNumber(value, decimalSeparator);
      if (isNaN(num)) return value;
      return Math.round(num).toString();
    }
    case "number": {
      const num = parseNumber(value, decimalSeparator);
      return formatNumber(num) || value;
    }
    default:
      return value;
  }
}

export function applyTransformation(
  value: string,
  transformation?: string,
): string {
  if (!transformation) return value;

  switch (transformation) {
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "trim":
      return value.trim();
    case "date":
      // Auto-detect input format, output as yyyy-MM-dd
      return formatDateAutoDetect(value, "yyyy-MM-dd");
    default:
      // Handle dateFormat:FORMAT pattern (legacy, auto-detect source)
      if (transformation.startsWith("dateFormat:")) {
        const format = transformation.slice(11);
        return formatDateAutoDetect(value, format);
      }
      // Handle date:targetFormat (auto-detect source) or date:sourceFormat:targetFormat
      if (transformation.startsWith("date:")) {
        const parts = transformation.slice(5).split(":");
        if (parts.length === 1) {
          // date:targetFormat - auto-detect source
          return formatDateAutoDetect(value, parts[0]);
        } else {
          // date:sourceFormat:targetFormat - explicit source format
          const sourceFormat = parts[0] || "yyyy-MM-dd";
          const targetFormat = parts[1] || "yyyy-MM-dd";
          return transformDate(value, sourceFormat, targetFormat);
        }
      }
      return value;
  }
}
