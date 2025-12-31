import { useSignal, useComputed, useSignalEffect } from "@preact/signals";
import { format as formatDate, parse as parseDate } from "@std/datetime";
import { detectAndDecodeText } from "../utils/encoding.ts";
import {
  detectDelimiter,
  DELIMITERS,
  parseCSV,
  type Delimiter,
  type ParsedCSV,
} from "../utils/csv.ts";
import {
  exportMappingConfig,
  serializeMappingConfig,
  parseNumber,
  formatNumber,
  type ColumnMapping,
  type Conversion,
  type DataType,
  type DecimalSeparator,
  type MappingConfig,
  type MappingConfigTypeTransformation,
  type MappingConfigTransformation,
} from "../utils/mapping.ts";

const DECIMAL_SEPARATORS: { separator: DecimalSeparator; label: string }[] = [
  { separator: ".", label: "Period (1,234.56)" },
  { separator: ",", label: "Comma (1.234,56)" },
];

interface Example {
  id: string;
  name: string;
  description: string;
  csv: string;
  mapping: string;
}

function convertValue(
  value: string,
  sourceType: DataType,
  conversions: Conversion[],
  decimalSeparator: DecimalSeparator = "."
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

function applyTransformation(value: string, transformation?: string): string {
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

// Common date formats for auto-detection (EU formats only)
const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "dd.MM.yyyy",
  "yyyy/MM/dd",
];

function tryParseDate(value: string, format: string): Date | null {
  if (!value || !format) return null;
  try {
    return parseDate(value, format);
  } catch {
    return null;
  }
}

function transformDate(value: string, sourceFormat: string, targetFormat: string): string {
  const date = tryParseDate(value, sourceFormat);
  if (!date) return "";
  return formatDate(date, targetFormat);
}

function parseDateAutoDetect(value: string): Date | null {
  if (!value) return null;

  // Try each EU format until one works
  for (const format of DATE_FORMATS) {
    const date = tryParseDate(value, format);
    if (date) return date;
  }

  return null;
}

function formatDateAutoDetect(value: string, targetFormat: string): string {
  const date = parseDateAutoDetect(value);
  if (!date) return "";
  return formatDate(date, targetFormat);
}

function generateOutputCSV(
  parsedCSV: ParsedCSV,
  mappings: ColumnMapping[],
  delimiter: Delimiter,
  decimalSeparator: DecimalSeparator
): string {
  const includedMappings = mappings.filter((m) => m.include);
  if (includedMappings.length === 0) return "";

  const headerLine = includedMappings.map((m) => m.targetColumn).join(delimiter);
  const dataLines = parsedCSV.rows.map((row) => {
    return includedMappings
      .map((mapping) => {
        const colIndex = parsedCSV.headers.indexOf(mapping.sourceColumn);
        if (colIndex === -1) return "";
        const value = row[colIndex] || "";
        const converted = convertValue(
          value,
          mapping.sourceType,
          mapping.conversions,
          decimalSeparator
        );
        const transformed = applyTransformation(converted, mapping.transformation);
        // Convert boolean to binary for CSV output
        const output = mapping.sourceType === "boolean"
          ? (transformed === "true" ? "1" : transformed === "false" ? "0" : transformed)
          : transformed;
        if (output.includes(delimiter) || output.includes('"')) {
          return `"${output.replace(/"/g, '""')}"`;
        }
        return output;
      })
      .join(delimiter);
  });

  return [headerLine, ...dataLines].join("\n");
}

export default function CSVMapper() {
  const inputCSV = useSignal("");
  const parsedCSV = useSignal<ParsedCSV>({ headers: [], rows: [] });
  const mappings = useSignal<ColumnMapping[]>([]);
  const expandedMapping = useSignal<number | null>(null);
  const encodingInfo = useSignal<string | null>(null);
  const encodingError = useSignal<string | null>(null);
  const inputDelimiter = useSignal<Delimiter>(";");
  const outputDelimiter = useSignal<Delimiter>(";");
  const decimalSeparator = useSignal<DecimalSeparator>(",");
  const importJsonText = useSignal("");
  const importJsonUrl = useSignal("");
  const importError = useSignal<string | null>(null);
  const importSuccess = useSignal<string | null>(null);
  const examples = useSignal<Example[]>([]);
  const selectedExample = useSignal<string>("");
  const exampleLoading = useSignal(false);

  // Load examples index on mount
  useSignalEffect(() => {
    fetch("/examples/index.json")
      .then((res) => res.json())
      .then((data) => {
        examples.value = data;
      })
      .catch(() => {
        // Silently fail if examples not available
      });
  });

  const outputCSV = useComputed(() => {
    if (parsedCSV.value.headers.length === 0) return "";
    return generateOutputCSV(parsedCSV.value, mappings.value, outputDelimiter.value, decimalSeparator.value);
  });

  const handleParseCSV = () => {
    // Auto-detect delimiter if not already detected
    if (inputCSV.value.trim()) {
      const detected = detectDelimiter(inputCSV.value);
      inputDelimiter.value = detected;
    }

    const parsed = parseCSV(inputCSV.value, inputDelimiter.value);
    parsedCSV.value = parsed;

    // Create lookup map from existing mappings to preserve schema configuration
    const existingMappingsMap = new Map(
      mappings.value.map((m) => [m.sourceColumn, m])
    );

    const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
      const existing = existingMappingsMap.get(header);
      if (existing) {
        // Preserve existing mapping configuration
        return { ...existing };
      }
      // Create default mapping for new columns
      return {
        sourceColumn: header,
        sourceType: "",
        targetColumn: header,
        conversions: [],
        include: true,
      };
    });

    mappings.value = newMappings;
  };

  const handleInputDelimiterChange = (newDelimiter: Delimiter) => {
    inputDelimiter.value = newDelimiter;
    if (inputCSV.value.trim() && parsedCSV.value.headers.length > 0) {
      // Re-parse with new delimiter
      const parsed = parseCSV(inputCSV.value, newDelimiter);
      parsedCSV.value = parsed;

      // Create lookup map from existing mappings to preserve schema configuration
      const existingMappingsMap = new Map(
        mappings.value.map((m) => [m.sourceColumn, m])
      );

      const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
        const existing = existingMappingsMap.get(header);
        if (existing) {
          // Preserve existing mapping configuration
          return { ...existing };
        }
        // Create default mapping for new columns
        return {
          sourceColumn: header,
          sourceType: "",
          targetColumn: header,
          conversions: [],
          include: true,
        };
      });

      mappings.value = newMappings;
    }
  };

  const loadExample = async (exampleId: string) => {
    const example = examples.value.find((e) => e.id === exampleId);
    if (!example) return;

    exampleLoading.value = true;
    importError.value = null;
    importSuccess.value = null;

    try {
      // Load CSV
      const csvResponse = await fetch(`/examples/${example.csv}`);
      if (!csvResponse.ok) throw new Error(`Failed to load CSV: ${csvResponse.statusText}`);
      const csvText = await csvResponse.text();
      inputCSV.value = csvText;

      // Auto-detect delimiter and parse
      const detected = detectDelimiter(csvText);
      inputDelimiter.value = detected;
      const parsed = parseCSV(csvText, detected);
      parsedCSV.value = parsed;

      // Create initial mappings
      const initialMappings: ColumnMapping[] = parsed.headers.map((header) => {
        return {
          sourceColumn: header,
          sourceType: "",
          targetColumn: header,
          conversions: [],
          include: true,
        };
      });
      mappings.value = initialMappings;

      // Load and apply mapping
      const mappingResponse = await fetch(`/examples/${example.mapping}`);
      if (!mappingResponse.ok) throw new Error(`Failed to load mapping: ${mappingResponse.statusText}`);
      const mappingConfig = await mappingResponse.json();
      validateAndApplyMapping(mappingConfig);

      selectedExample.value = exampleId;
      encodingInfo.value = "UTF-8";
    } catch (err) {
      importError.value = `Failed to load example: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      exampleLoading.value = false;
    }
  };

  const handleClear = () => {
    inputCSV.value = "";
    parsedCSV.value = { headers: [], rows: [] };
    mappings.value = [];
    encodingInfo.value = null;
    encodingError.value = null;
    selectedExample.value = "";
    importError.value = null;
    importSuccess.value = null;
  };

  const updateMapping = (index: number, updates: Partial<ColumnMapping>) => {
    const newMappings = [...mappings.value];
    newMappings[index] = { ...newMappings[index], ...updates };
    mappings.value = newMappings;
  };

  const addConversion = (mappingIndex: number) => {
    const newMappings = [...mappings.value];
    newMappings[mappingIndex].conversions.push({
      sourceValue: "",
      targetValue: "",
    });
    mappings.value = newMappings;
  };

  const updateConversion = (
    mappingIndex: number,
    convIndex: number,
    updates: Partial<Conversion>
  ) => {
    const newMappings = [...mappings.value];
    newMappings[mappingIndex].conversions[convIndex] = {
      ...newMappings[mappingIndex].conversions[convIndex],
      ...updates,
    };
    mappings.value = newMappings;
  };

  const removeConversion = (mappingIndex: number, convIndex: number) => {
    const newMappings = [...mappings.value];
    newMappings[mappingIndex].conversions.splice(convIndex, 1);
    mappings.value = newMappings;
  };

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    encodingError.value = null;
    encodingInfo.value = null;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const result = detectAndDecodeText(buffer);

      if ("error" in result) {
        encodingError.value = result.error;
        inputCSV.value = "";
      } else {
        encodingInfo.value = result.encoding;
        inputCSV.value = result.text;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadOutput = () => {
    const blob = new Blob([outputCSV.value], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapped_output.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputCSV.value);
  };

  const getMappingConfig = (): MappingConfig => {
    return exportMappingConfig({
      mappings: mappings.value,
      inputDelimiter: inputDelimiter.value,
      outputDelimiter: outputDelimiter.value,
      decimalSeparator: decimalSeparator.value,
    });
  };

  const downloadMappingJson = () => {
    const config = getMappingConfig();
    const json = serializeMappingConfig(config);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapping.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMappingJson = () => {
    const config = getMappingConfig();
    const json = serializeMappingConfig(config);
    navigator.clipboard.writeText(json);
  };

  const validateAndApplyMapping = (config: unknown): boolean => {
    importError.value = null;
    importSuccess.value = null;

    if (!config || typeof config !== "object") {
      importError.value = "Invalid JSON: expected an object";
      return false;
    }

    const obj = config as Record<string, unknown>;

    if (obj.version !== "1.0") {
      importError.value = `Unsupported version: ${obj.version}. Expected "1.0"`;
      return false;
    }

    if (!obj.mappings || typeof obj.mappings !== "object" || Array.isArray(obj.mappings)) {
      importError.value = "Invalid mapping: 'mappings' must be an object";
      return false;
    }

    const mappingsObj = obj.mappings as Record<string, unknown>;
    const validTypes = ["string", "integer", "number", "boolean"];
    const validDelimiters = [",", ";", "\t"];

    // Validate mappings object
    for (const [source, target] of Object.entries(mappingsObj)) {
      if (typeof target !== "string") {
        importError.value = `Mapping '${source}': target must be a string`;
        return false;
      }
    }

    // Validate typeTransformations if present
    if (obj.typeTransformations !== undefined) {
      if (typeof obj.typeTransformations !== "object" || Array.isArray(obj.typeTransformations)) {
        importError.value = "Invalid 'typeTransformations': must be an object";
        return false;
      }

      const typeTransformationsObj = obj.typeTransformations as Record<string, unknown>;
      for (const [source, transType] of Object.entries(typeTransformationsObj)) {
        if (typeof transType !== "string" || !validTypes.includes(transType)) {
          importError.value = `Type transformation '${source}': must be one of: ${validTypes.join(", ")}`;
          return false;
        }
      }
    }

    // Validate transformations if present
    const validTransformations = ["uppercase", "lowercase", "trim", "date"];
    if (obj.transformations !== undefined) {
      if (typeof obj.transformations !== "object" || Array.isArray(obj.transformations)) {
        importError.value = "Invalid 'transformations': must be an object";
        return false;
      }

      const transformationsObj = obj.transformations as Record<string, unknown>;
      for (const [source, trans] of Object.entries(transformationsObj)) {
        if (typeof trans !== "string") {
          importError.value = `Transformation '${source}': must be a string`;
          return false;
        }
        // Allow valid transformations, dateFormat:*, or date[:source][:target]
        const isValid = validTransformations.includes(trans) ||
          trans.startsWith("dateFormat:") ||
          trans.startsWith("date:");
        if (!isValid) {
          importError.value = `Transformation '${source}': must be one of: ${validTransformations.join(", ")}, dateFormat:FORMAT, or date[:sourceFormat][:targetFormat]`;
          return false;
        }
      }
    }

    if (obj.inputDelimiter !== undefined && !validDelimiters.includes(obj.inputDelimiter as string)) {
      importError.value = `Invalid 'inputDelimiter': must be one of: comma, semicolon, tab`;
      return false;
    }

    if (obj.outputDelimiter !== undefined && !validDelimiters.includes(obj.outputDelimiter as string)) {
      importError.value = `Invalid 'outputDelimiter': must be one of: comma, semicolon, tab`;
      return false;
    }

    const validDecimalSeparators = [".", ","];
    if (obj.decimalSeparator !== undefined && !validDecimalSeparators.includes(obj.decimalSeparator as string)) {
      importError.value = `Invalid 'decimalSeparator': must be one of: . (period), , (comma)`;
      return false;
    }

    // Validate that mapping sourceColumns exist in parsed CSV headers
    if (parsedCSV.value.headers.length === 0) {
      importError.value = "No CSV loaded. Please parse a CSV file first.";
      return false;
    }

    const sourceHeaders = new Set(parsedCSV.value.headers);
    const missingHeaders: string[] = [];
    for (const source of Object.keys(mappingsObj)) {
      if (!sourceHeaders.has(source)) {
        missingHeaders.push(source);
      }
    }

    if (missingHeaders.length > 0) {
      importError.value = `Mapping references columns not in source CSV: ${missingHeaders.join(", ")}`;
      return false;
    }

    // Apply the configuration
    if (obj.inputDelimiter) {
      inputDelimiter.value = obj.inputDelimiter as Delimiter;
    }
    if (obj.outputDelimiter) {
      outputDelimiter.value = obj.outputDelimiter as Delimiter;
    }
    if (obj.decimalSeparator) {
      decimalSeparator.value = obj.decimalSeparator as DecimalSeparator;
    }

    const typeTransformationsObj = (obj.typeTransformations || {}) as Record<string, MappingConfigTypeTransformation>;
    const transformationsObj = (obj.transformations || {}) as Record<string, MappingConfigTransformation>;
    const valueConversionsObj = (obj.valueConversions || {}) as Record<string, Record<string, string>>;

    // Build mappings from parsed CSV headers
    const newMappings: ColumnMapping[] = parsedCSV.value.headers.map((header) => {
      const isIncluded = header in mappingsObj;
      const targetColumn = isIncluded ? (mappingsObj[header] as string) : header;
      const transformationType = typeTransformationsObj[header];
      const transformation = transformationsObj[header];
      const valueConvMap = valueConversionsObj[header] || {};
      const conversions = Object.entries(valueConvMap).map(([sourceValue, targetValue]) => ({
        sourceValue,
        targetValue,
      }));

      return {
        sourceColumn: header,
        sourceType: (transformationType || "") as DataType,
        targetColumn,
        conversions,
        transformation,
        include: isIncluded,
      };
    });

    mappings.value = newMappings;
    importSuccess.value = `Imported ${Object.keys(mappingsObj).length} mapping(s)`;
    return true;
  };

  const importFromText = () => {
    try {
      const config = JSON.parse(importJsonText.value);
      if (validateAndApplyMapping(config)) {
        importJsonText.value = "";
      }
    } catch {
      importError.value = "Invalid JSON syntax";
    }
  };

  const importFromUrl = async () => {
    if (!importJsonUrl.value.trim()) {
      importError.value = "Please enter a URL";
      return;
    }

    try {
      importError.value = null;
      importSuccess.value = null;
      const response = await fetch(importJsonUrl.value);
      if (!response.ok) {
        importError.value = `Failed to fetch: ${response.status} ${response.statusText}`;
        return;
      }
      const config = await response.json();
      if (validateAndApplyMapping(config)) {
        importJsonUrl.value = "";
      }
    } catch (err) {
      importError.value = `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}`;
    }
  };

  return (
    <div class="space-y-4">
      {/* CSV Input */}
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          CSV Input
        </label>
        <div class="mb-3">
          <label class="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              class="hidden"
            />
            <div class="text-center">
              <div class="text-gray-500 text-sm">Drop CSV file or click to browse</div>
            </div>
          </label>
        </div>

        {encodingError.value && (
          <div class="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div class="text-red-700 text-sm">{encodingError.value}</div>
          </div>
        )}

        {encodingInfo.value && (
          <div class="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
            <div class="text-green-700 text-sm">
              Detected encoding: <span class="font-medium">{encodingInfo.value}</span>
            </div>
          </div>
        )}

        <textarea
          value={inputCSV.value}
          onInput={(e) => inputCSV.value = (e.target as HTMLTextAreaElement).value}
          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
          placeholder="Or paste CSV data here..."
          rows={6}
        />

        <div class="mt-3 flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Input delimiter:</label>
            <select
              value={inputDelimiter.value}
              onChange={(e) => handleInputDelimiterChange((e.target as HTMLSelectElement).value as Delimiter)}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DELIMITERS.map((d) => (
                <option key={d.delimiter} value={d.delimiter}>{d.label}</option>
              ))}
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Output delimiter:</label>
            <select
              value={outputDelimiter.value}
              onChange={(e) => outputDelimiter.value = (e.target as HTMLSelectElement).value as Delimiter}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DELIMITERS.map((d) => (
                <option key={d.delimiter} value={d.delimiter}>{d.label}</option>
              ))}
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Decimal separator:</label>
            <select
              value={decimalSeparator.value}
              onChange={(e) => decimalSeparator.value = (e.target as HTMLSelectElement).value as DecimalSeparator}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DECIMAL_SEPARATORS.map((d) => (
                <option key={d.separator} value={d.separator}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={handleParseCSV}
          disabled={!inputCSV.value.trim()}
          class={`px-6 py-2 font-medium rounded-lg transition-colors ${
            !inputCSV.value.trim()
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          Map CSV
        </button>
        <button
          onClick={handleClear}
          class="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>

        {examples.value.length > 0 && (
          <div class="flex items-center gap-2 ml-auto">
            <label class="text-sm text-gray-600">Load example:</label>
            <select
              value={selectedExample.value}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                if (value) loadExample(value);
              }}
              disabled={exampleLoading.value}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">Select example...</option>
              {examples.value.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
            {exampleLoading.value && (
              <span class="text-sm text-gray-500">Loading...</span>
            )}
          </div>
        )}
      </div>

      {/* Example Description */}
      {selectedExample.value && (
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="text-blue-700 text-sm">
            {examples.value.find((e) => e.id === selectedExample.value)?.description}
          </div>
        </div>
      )}

      {/* Column Mapping */}
      {parsedCSV.value.headers.length > 0 && (
        <div class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-blue-700 font-medium">
                  {parsedCSV.value.headers.length} columns
                </span>
                <span class="text-blue-600 mx-2">·</span>
                <span class="text-blue-700 font-medium">
                  {parsedCSV.value.rows.length} rows
                </span>
              </div>
              <div class="text-sm text-blue-600">
                {mappings.value.filter((m) => m.include).length} columns included
              </div>
            </div>
          </div>

          {/* Import/Export Mapping Schema */}
          <details class="bg-white rounded-lg shadow border border-gray-200">
            <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
              Import / Export Mapping Schema
            </summary>
            <div class="px-4 py-4 border-t border-gray-200 space-y-4">
              {/* Error/Success Messages */}
              {importError.value && (
                <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div class="text-red-700 text-sm">{importError.value}</div>
                </div>
              )}
              {importSuccess.value && (
                <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div class="text-green-700 text-sm">{importSuccess.value}</div>
                </div>
              )}

              {/* Export Section */}
              <div>
                <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">Export</h4>
                <div class="flex gap-2">
                  <button
                    onClick={downloadMappingJson}
                    class="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Download JSON
                  </button>
                  <button
                    onClick={copyMappingJson}
                    class="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </div>

              {/* Import from Text */}
              <div>
                <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">Import from JSON</h4>
                <textarea
                  value={importJsonText.value}
                  onInput={(e) => importJsonText.value = (e.target as HTMLTextAreaElement).value}
                  class="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder='{"version": "1.0", "mappings": [...]}'
                  rows={3}
                />
                <button
                  onClick={importFromText}
                  disabled={!importJsonText.value.trim()}
                  class={`mt-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    !importJsonText.value.trim()
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  Import from Text
                </button>
              </div>

              {/* Import from URL */}
              <div>
                <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">Import from URL</h4>
                <div class="flex gap-2">
                  <input
                    type="url"
                    value={importJsonUrl.value}
                    onInput={(e) => importJsonUrl.value = (e.target as HTMLInputElement).value}
                    class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://example.com/mapping.json"
                  />
                  <button
                    onClick={importFromUrl}
                    disabled={!importJsonUrl.value.trim()}
                    class={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      !importJsonUrl.value.trim()
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    Fetch & Import
                  </button>
                </div>
              </div>

              {/* Schema Reference */}
              <details class="text-xs text-gray-500">
                <summary class="cursor-pointer hover:text-gray-700">Schema Reference (JSON Schema types)</summary>
                <pre class="mt-2 p-3 bg-gray-100 rounded-lg overflow-x-auto text-xs">{`{
  "version": "1.0",
  "inputDelimiter": "," | ";" | "\\t",
  "outputDelimiter": "," | ";" | "\\t",
  "decimalSeparator": "." | ",",
  "mappings": {
    "sourceColumn": "targetColumn"
  },
  "typeTransformations": {
    "column": "string | integer | number | boolean"
  },
  "transformations": {
    "column": "uppercase | lowercase | trim | date | date:targetFormat | date:sourceFormat:targetFormat"
  },
  "valueConversions": {
    "column": { "Mr": "male", "Ms": "female" }
  }
}

boolean outputs as 1/0 in CSV
number/integer: thousand separators removed, decimal separator configurable
valueConversions: map specific values to other values (case-insensitive)
date: auto-detects input format (yyyy-MM-dd, dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy, yyyy/MM/dd)
date tokens: yyyy, MM, dd, HH, mm, ss
date examples: date (auto → yyyy-MM-dd), date:dd/MM/yyyy (auto → custom)
invalid dates output empty string`}</pre>
              </details>
            </div>
          </details>

          <div class="bg-white rounded-lg shadow border border-gray-200">
            <div class="px-4 py-3 border-b border-gray-200">
              <h3 class="text-sm font-medium text-gray-700">Column Mapping</h3>
            </div>
            <div class="divide-y divide-gray-100">
              {mappings.value.map((mapping, index) => (
                <div
                  key={mapping.sourceColumn}
                  class={`${mapping.include ? "" : "opacity-50"}`}
                >
                  <div class="flex items-center gap-4 px-4 py-3">
                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        checked={mapping.include}
                        onChange={(e) =>
                          updateMapping(index, {
                            include: (e.target as HTMLInputElement).checked,
                          })
                        }
                        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>

                    <div class="flex items-center gap-3 flex-1 min-w-0">
                      <div class="w-32">
                        <div class="text-xs text-gray-500 mb-0.5">Source</div>
                        <div class="font-mono text-sm text-gray-800 truncate">
                          {mapping.sourceColumn}
                        </div>
                      </div>

                      <div class="text-gray-400">→</div>

                      <div class="w-32">
                        <div class="text-xs text-gray-500 mb-0.5">Target</div>
                        <input
                          type="text"
                          value={mapping.targetColumn}
                          onInput={(e) =>
                            updateMapping(index, {
                              targetColumn: (e.target as HTMLInputElement).value,
                            })
                          }
                          class="w-full px-2 py-1 text-sm font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          disabled={!mapping.include}
                        />
                      </div>

                      <div class="w-28">
                        <div class="text-xs text-gray-500 mb-0.5">Type</div>
                        <select
                          value={mapping.sourceType}
                          onChange={(e) =>
                            updateMapping(index, {
                              sourceType: (e.target as HTMLSelectElement)
                                .value as DataType,
                            })
                          }
                          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          disabled={!mapping.include}
                        >
                          <option value="">—</option>
                          <option value="string">string</option>
                          <option value="integer">integer</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                      </div>

                      <div class="text-xs text-gray-400">
                        {mapping.conversions.length > 0 && (
                          <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {mapping.conversions.length} conversion{mapping.conversions.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        expandedMapping.value =
                          expandedMapping.value === index ? null : index
                      }
                      class="px-3 py-1 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      disabled={!mapping.include}
                    >
                      {expandedMapping.value === index ? "Hide" : "Edit"}
                    </button>
                  </div>

                  {expandedMapping.value === index && mapping.include && (
                    <div class="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div class="flex items-center justify-between mb-2">
                            <h4 class="text-xs font-medium text-gray-600 uppercase">
                              Value Conversions
                            </h4>
                            <button
                              onClick={() => addConversion(index)}
                              class="text-xs text-blue-600 hover:text-blue-800"
                            >
                              + Add
                            </button>
                          </div>

                          {mapping.conversions.length === 0 ? (
                            <p class="text-sm text-gray-500 italic">
                              No conversions. Default type conversion applied.
                            </p>
                          ) : (
                            <div class="space-y-2">
                              {mapping.conversions.map((conv, convIndex) => (
                                <div key={convIndex} class="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={conv.sourceValue}
                                    onInput={(e) =>
                                      updateConversion(index, convIndex, {
                                        sourceValue: (e.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder="From"
                                    class="flex-1 px-2 py-1 text-sm font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                  />
                                  <span class="text-gray-400">→</span>
                                  <input
                                    type="text"
                                    value={conv.targetValue}
                                    onInput={(e) =>
                                      updateConversion(index, convIndex, {
                                        targetValue: (e.target as HTMLInputElement).value,
                                      })
                                    }
                                    placeholder="To"
                                    class="flex-1 px-2 py-1 text-sm font-mono border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                  />
                                  <button
                                    onClick={() => removeConversion(index, convIndex)}
                                    class="text-red-500 hover:text-red-700 px-1"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">
                            Sample Preview
                          </h4>
                          <div class="space-y-1">
                            {parsedCSV.value.rows.slice(0, 4).map((row, rowIndex) => {
                              const colIndex = parsedCSV.value.headers.indexOf(
                                mapping.sourceColumn
                              );
                              const original = row[colIndex] || "";
                              const converted = convertValue(
                                original,
                                mapping.sourceType,
                                mapping.conversions,
                                decimalSeparator.value
                              );
                              return (
                                <div
                                  key={rowIndex}
                                  class="flex items-center gap-2 text-sm font-mono"
                                >
                                  <span class="text-gray-500">{original}</span>
                                  <span class="text-gray-400">→</span>
                                  <span
                                    class={
                                      original !== converted
                                        ? "text-green-600 font-medium"
                                        : "text-gray-700"
                                    }
                                  >
                                    {converted}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSV Output */}
      {outputCSV.value && (
        <div class="space-y-4">
          <div class="flex gap-3">
            <button
              onClick={downloadOutput}
              class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Download CSV
            </button>
            <button
              onClick={copyToClipboard}
              class="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              Copy to Clipboard
            </button>
          </div>

          <div class="bg-white rounded-lg shadow border border-gray-200">
            <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-700">Output Preview</h3>
              <span class="text-xs text-gray-500">
                {outputCSV.value.trim().split("\n").length} lines
              </span>
            </div>
            <pre class="p-4 text-sm font-mono text-gray-700 overflow-x-auto max-h-48 overflow-y-auto">
              {outputCSV.value}
            </pre>
          </div>

          <div class="bg-white rounded-lg shadow border border-gray-200">
            <div class="px-4 py-3 border-b border-gray-200">
              <h3 class="text-sm font-medium text-gray-700">Table View</h3>
            </div>
            <div class="overflow-x-auto max-h-72 overflow-y-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 bg-gray-50">
                    {mappings.value
                      .filter((m) => m.include)
                      .map((m) => (
                        <th
                          key={m.targetColumn}
                          class="text-left py-2 px-4 font-medium text-gray-700"
                        >
                          {m.targetColumn}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedCSV.value.rows.slice(0, 15).map((row, rowIndex) => (
                    <tr key={rowIndex} class="border-b border-gray-100">
                      {mappings.value
                        .filter((m) => m.include)
                        .map((mapping) => {
                          const colIndex = parsedCSV.value.headers.indexOf(
                            mapping.sourceColumn
                          );
                          const value = row[colIndex] || "";
                          const converted = convertValue(
                            value,
                            mapping.sourceType,
                            mapping.conversions,
                            decimalSeparator.value
                          );
                          const transformed = applyTransformation(converted, mapping.transformation);
                          return (
                            <td
                              key={mapping.targetColumn}
                              class="py-2 px-4 text-gray-600 font-mono"
                            >
                              {transformed}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedCSV.value.rows.length > 15 && (
              <div class="px-4 py-2 text-xs text-gray-500 text-center border-t border-gray-100">
                Showing 15 of {parsedCSV.value.rows.length} rows
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
