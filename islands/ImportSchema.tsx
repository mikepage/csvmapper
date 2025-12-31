import { type Signal } from "@preact/signals";
import {
  type ColumnMapping,
  type DataType,
  type DecimalSeparator,
  type MappingConfig,
  type MappingConfigTypeTransformation,
  type MappingConfigTransformation,
} from "../utils/mapping.ts";
import { type Delimiter, type ParsedCSV } from "../utils/csv.ts";

interface ImportSchemaProps {
  mappings: Signal<ColumnMapping[]>;
  parsedCSV: Signal<ParsedCSV>;
  inputDelimiter: Signal<Delimiter>;
  outputDelimiter: Signal<Delimiter>;
  decimalSeparator: Signal<DecimalSeparator>;
  importError: Signal<string | null>;
  importSuccess: Signal<string | null>;
  schemaName: Signal<string>;
}

export default function ImportSchema({
  mappings,
  parsedCSV,
  inputDelimiter,
  outputDelimiter,
  decimalSeparator,
  importError,
  importSuccess,
  schemaName,
}: ImportSchemaProps) {
  const applySchemaConfig = (config: MappingConfig): boolean => {
    const mappingsObj = config.mappings as Record<string, string>;
    const validTypes = ["string", "integer", "number", "boolean"];
    const validDelimiters = [",", ";", "\t"];

    for (const [source, target] of Object.entries(mappingsObj)) {
      if (typeof target !== "string") {
        importError.value = `Mapping '${source}': target must be a string`;
        return false;
      }
    }

    if (config.typeTransformations !== undefined) {
      for (const [source, transType] of Object.entries(config.typeTransformations)) {
        if (typeof transType !== "string" || !validTypes.includes(transType)) {
          importError.value = `Type transformation '${source}': must be one of: ${validTypes.join(", ")}`;
          return false;
        }
      }
    }

    const validTransformations = ["uppercase", "lowercase", "trim", "date"];
    if (config.transformations !== undefined) {
      for (const [source, trans] of Object.entries(config.transformations)) {
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

    if (config.inputDelimiter !== undefined && !validDelimiters.includes(config.inputDelimiter)) {
      importError.value = `Invalid 'inputDelimiter': must be one of: comma, semicolon, tab`;
      return false;
    }

    if (config.outputDelimiter !== undefined && !validDelimiters.includes(config.outputDelimiter)) {
      importError.value = `Invalid 'outputDelimiter': must be one of: comma, semicolon, tab`;
      return false;
    }

    const validDecimalSeparators = [".", ","];
    if (config.decimalSeparator !== undefined && !validDecimalSeparators.includes(config.decimalSeparator)) {
      importError.value = `Invalid 'decimalSeparator': must be one of: . (period), , (comma)`;
      return false;
    }

    if (parsedCSV.value.headers.length === 0) {
      importError.value = "No CSV loaded. Please load a CSV file first.";
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

    if (config.inputDelimiter) {
      inputDelimiter.value = config.inputDelimiter as Delimiter;
    }
    if (config.outputDelimiter) {
      outputDelimiter.value = config.outputDelimiter as Delimiter;
    }
    if (config.decimalSeparator) {
      decimalSeparator.value = config.decimalSeparator as DecimalSeparator;
    }

    const typeTransformationsObj = (config.typeTransformations || {}) as Record<string, MappingConfigTypeTransformation>;
    const transformationsObj = (config.transformations || {}) as Record<string, MappingConfigTransformation>;
    const valueConversionsObj = (config.valueConversions || {}) as Record<string, Record<string, string>>;

    const newMappings: ColumnMapping[] = parsedCSV.value.headers.map((header) => {
      const isIncluded = header in mappingsObj;
      const targetColumn = isIncluded ? mappingsObj[header] : header;
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
    return true;
  };

  const validateAndApplyCollection = (data: unknown): boolean => {
    importError.value = null;
    importSuccess.value = null;

    if (!data || typeof data !== "object") {
      importError.value = "Invalid JSON: expected an object";
      return false;
    }

    const obj = data as Record<string, unknown>;

    if (!obj.schemas || !Array.isArray(obj.schemas)) {
      importError.value = "Invalid format: expected a collection with 'schemas' array";
      return false;
    }

    const schemas = obj.schemas as Array<Record<string, unknown>>;
    if (schemas.length === 0) {
      importError.value = "Collection contains no schemas";
      return false;
    }

    const firstSchema = schemas[0];
    if (!firstSchema.name || typeof firstSchema.name !== "string") {
      importError.value = "Schema must have a 'name' property";
      return false;
    }

    const config = firstSchema.config as MappingConfig | undefined;
    if (!config) {
      importError.value = "Schema must have a 'config' property";
      return false;
    }

    if (config.version !== "1.0") {
      importError.value = `Unsupported version: ${config.version}. Expected "1.0"`;
      return false;
    }

    if (!config.mappings || typeof config.mappings !== "object" || Array.isArray(config.mappings)) {
      importError.value = "Invalid mapping: 'mappings' must be an object";
      return false;
    }

    if (applySchemaConfig(config)) {
      schemaName.value = firstSchema.name;
      importSuccess.value = `Imported schema: ${firstSchema.name}`;
      return true;
    }
    return false;
  };

  const handleImportFromText = (text: string) => {
    try {
      const data = JSON.parse(text);
      return validateAndApplyCollection(data);
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
      const data = await response.json();
      return validateAndApplyCollection(data);
    } catch (err) {
      importError.value = `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}`;
      return false;
    }
  };

  return (
    <details open class="bg-white rounded-lg shadow border border-gray-200">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
        Import Schema
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

        {/* Import from URL */}
        <div>
          <label class="block text-sm text-gray-600 mb-1">Import from URL</label>
          <div class="flex gap-2 mb-2">
            <input
              type="url"
              id="import-json-url"
              class="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://example.com/mapping-collection.json"
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
          <button
            onClick={() => handleImportFromUrl("https://csvmapper-schemas.mikepage.deno.net/examples.json")}
            class="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            Load examples collection
          </button>
        </div>

        {/* Import from Text */}
        <div>
          <label class="block text-sm text-gray-600 mb-1">Import from JSON</label>
          <textarea
            id="import-json-text"
            class="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder='{"$schema": "...", "schemas": [...]}'
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

        {/* Schema Reference */}
        <details class="text-xs text-gray-500">
          <summary class="cursor-pointer hover:text-gray-700">Schema Reference</summary>
          <pre class="mt-2 p-3 bg-gray-100 rounded-lg overflow-x-auto text-xs">{`{
  "$schema": "https://csvmapper.mikepage.deno.net/schemas/mapping.schema.json#/$defs/MappingCollection",
  "schemas": [
    {
      "name": "My Schema",
      "config": {
        "version": "1.0",
        "mappings": { "sourceColumn": "targetColumn" },
        "typeTransformations": { "column": "integer" },
        "transformations": { "column": "uppercase" },
        "valueConversions": { "column": { "Mr": "male" } }
      }
    }
  ]
}`}</pre>
        </details>
      </div>
    </details>
  );
}
