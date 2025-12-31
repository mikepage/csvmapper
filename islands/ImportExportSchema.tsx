import { type Signal } from "@preact/signals";
import {
  exportMappingConfig,
  serializeMappingConfig,
  type ColumnMapping,
  type DataType,
  type DecimalSeparator,
  type MappingConfig,
  type MappingConfigTypeTransformation,
  type MappingConfigTransformation,
} from "../utils/mapping.ts";
import { type Delimiter, type ParsedCSV } from "../utils/csv.ts";

interface ImportExportSchemaProps {
  mappings: Signal<ColumnMapping[]>;
  parsedCSV: Signal<ParsedCSV>;
  inputDelimiter: Signal<Delimiter>;
  outputDelimiter: Signal<Delimiter>;
  decimalSeparator: Signal<DecimalSeparator>;
  importError: Signal<string | null>;
  importSuccess: Signal<string | null>;
}

export default function ImportExportSchema({
  mappings,
  parsedCSV,
  inputDelimiter,
  outputDelimiter,
  decimalSeparator,
  importError,
  importSuccess,
}: ImportExportSchemaProps) {
  const getMappingConfig = (): MappingConfig => {
    return exportMappingConfig({
      mappings: mappings.value,
      inputDelimiter: inputDelimiter.value,
      outputDelimiter: outputDelimiter.value,
      decimalSeparator: decimalSeparator.value,
    });
  };

  const getFormattedJson = (): string => {
    const config = getMappingConfig();
    return serializeMappingConfig(config);
  };

  const downloadMappingJson = () => {
    const json = getFormattedJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapping.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMappingJson = () => {
    const json = getFormattedJson();
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

    for (const [source, target] of Object.entries(mappingsObj)) {
      if (typeof target !== "string") {
        importError.value = `Mapping '${source}': target must be a string`;
        return false;
      }
    }

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

  const handleImportFromText = (text: string) => {
    try {
      const config = JSON.parse(text);
      return validateAndApplyMapping(config);
    } catch {
      importError.value = "Invalid JSON syntax";
      return false;
    }
  };

  const handleImportFromUrl = async (url: string) => {
    if (!url.trim()) {
      importError.value = "Please enter a URL";
      return false;
    }

    try {
      importError.value = null;
      importSuccess.value = null;
      const response = await fetch(url);
      if (!response.ok) {
        importError.value = `Failed to fetch: ${response.status} ${response.statusText}`;
        return false;
      }
      const config = await response.json();
      return validateAndApplyMapping(config);
    } catch (err) {
      importError.value = `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}`;
      return false;
    }
  };

  return (
    <details open class="bg-white rounded-lg shadow border border-gray-200">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
        Import / Export Mapping Schema
      </summary>
      <div class="px-4 py-4 border-t border-gray-200 space-y-4">
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

        {/* Export Section with JSON Output */}
        <div>
          <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">Export</h4>
          <div class="flex gap-2 mb-3">
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
          <pre class="p-3 bg-gray-100 rounded-lg overflow-x-auto text-xs font-mono max-h-48 overflow-y-auto">
            {getFormattedJson()}
          </pre>
        </div>

        {/* Import from Text */}
        <div>
          <h4 class="text-xs font-medium text-gray-600 uppercase mb-2">Import from JSON</h4>
          <textarea
            id="import-json-text"
            class="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder='{"version": "1.0", "mappings": {...}}'
            rows={3}
          />
          <button
            onClick={() => {
              const textarea = document.getElementById("import-json-text") as HTMLTextAreaElement;
              if (textarea.value.trim() && handleImportFromText(textarea.value)) {
                textarea.value = "";
              }
            }}
            class="mt-2 px-3 py-1.5 text-sm rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
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
              id="import-json-url"
              class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://example.com/mapping.json"
            />
            <button
              onClick={async () => {
                const input = document.getElementById("import-json-url") as HTMLInputElement;
                if (await handleImportFromUrl(input.value)) {
                  input.value = "";
                }
              }}
              class="px-3 py-1.5 text-sm rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
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
date examples: date (auto -> yyyy-MM-dd), date:dd/MM/yyyy (auto -> custom)
invalid dates output empty string`}</pre>
        </details>
      </div>
    </details>
  );
}
