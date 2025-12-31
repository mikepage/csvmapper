import type { Delimiter } from "./csv.ts";

/**
 * Data types based on JSON Schema
 * @see https://json-schema.org/understanding-json-schema/reference
 */
export type DataType = "" | "string" | "integer" | "number" | "boolean";

/**
 * Decimal separator for number parsing
 */
export type DecimalSeparator = "." | ",";

/**
 * Mapping Configuration Schema
 * @see /schemas/mapping.schema.json
 */
export type MappingConfigTypeTransformation = DataType;
export type MappingConfigTransformation = "uppercase" | "lowercase" | "trim" | string;

export interface MappingConfig {
  version: "1.0";
  inputDelimiter?: Delimiter;
  outputDelimiter?: Delimiter;
  decimalSeparator?: DecimalSeparator;
  mappings: Record<string, string>;
  typeTransformations?: Record<string, MappingConfigTypeTransformation>;
  transformations?: Record<string, MappingConfigTransformation>;
  valueConversions?: Record<string, Record<string, string>>;
}

export interface ColumnMapping {
  sourceColumn: string;
  sourceType: DataType;
  targetColumn: string;
  conversions: Conversion[];
  transformation?: string;
  include: boolean;
}

export interface Conversion {
  sourceValue: string;
  targetValue: string;
}

export interface ExportMappingOptions {
  mappings: ColumnMapping[];
  inputDelimiter: Delimiter;
  outputDelimiter: Delimiter;
  decimalSeparator: DecimalSeparator;
}

/**
 * Export column mappings to a MappingConfig object
 */
export function exportMappingConfig(options: ExportMappingOptions): MappingConfig {
  const { mappings, inputDelimiter, outputDelimiter, decimalSeparator } = options;

  const mappingsObj: Record<string, string> = {};
  const typeTransformationsObj: Record<string, MappingConfigTypeTransformation> = {};
  const transformationsObj: Record<string, MappingConfigTransformation> = {};
  const valueConversionsObj: Record<string, Record<string, string>> = {};

  for (const m of mappings) {
    if (!m.include) continue;
    mappingsObj[m.sourceColumn] = m.targetColumn;

    // Only include type transformation if explicitly set (not empty or string)
    if (m.sourceType && m.sourceType !== "string") {
      typeTransformationsObj[m.sourceColumn] = m.sourceType;
    }

    // Include value transformation if defined
    if (m.transformation) {
      transformationsObj[m.sourceColumn] = m.transformation;
    }

    // Include value conversions if defined
    if (m.conversions.length > 0) {
      const convMap: Record<string, string> = {};
      for (const conv of m.conversions) {
        if (conv.sourceValue) {
          convMap[conv.sourceValue] = conv.targetValue;
        }
      }
      if (Object.keys(convMap).length > 0) {
        valueConversionsObj[m.sourceColumn] = convMap;
      }
    }
  }

  const config: MappingConfig = {
    version: "1.0",
    inputDelimiter,
    outputDelimiter,
    decimalSeparator,
    mappings: mappingsObj,
  };

  if (Object.keys(typeTransformationsObj).length > 0) {
    config.typeTransformations = typeTransformationsObj;
  }

  if (Object.keys(transformationsObj).length > 0) {
    config.transformations = transformationsObj;
  }

  if (Object.keys(valueConversionsObj).length > 0) {
    config.valueConversions = valueConversionsObj;
  }

  return config;
}

/**
 * Parse a number string with the given decimal separator.
 * Removes thousand separators and converts to standard format.
 */
export function parseNumber(value: string, decimalSeparator: DecimalSeparator): number {
  if (!value || value.trim() === "") return NaN;

  let cleaned = value.trim();

  if (decimalSeparator === ",") {
    // EU format: 1.234,56 -> remove . (thousands), replace , with . (decimal)
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // US format: 1,234.56 -> remove , (thousands)
    cleaned = cleaned.replace(/,/g, "");
  }

  return parseFloat(cleaned);
}

/**
 * Format a number for output (always uses . as decimal separator)
 */
export function formatNumber(value: number): string {
  if (isNaN(value)) return "";
  return value.toString();
}

/**
 * Serialize mapping config to JSON string
 */
export function serializeMappingConfig(config: MappingConfig, pretty = true): string {
  return JSON.stringify(config, null, pretty ? 2 : undefined);
}
