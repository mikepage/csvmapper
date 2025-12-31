import { useSignal, type Signal } from "@preact/signals";

const EXAMPLES_SCHEMA_URL = "https://csv-import-formatter-schemas.mikepage.deno.net/schema/examples.json";

import {
  type ColumnMapping,
  type DataType,
  type DecimalSeparator,
  type MappingConfig,
  type MappingConfigTypeTransformation,
  type MappingConfigTransformation,
} from "../utils/mapping.ts";
import { type Delimiter, type ParsedCSV } from "../utils/csv.ts";

interface SchemaItem {
  name: string;
  config: MappingConfig;
}

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
  const loadedSchemas = useSignal<SchemaItem[]>([]);
  const selectedSchemaIndex = useSignal<number>(0);

  const applySchemaConfig = (config: MappingConfig, name: string): boolean => {
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
    schemaName.value = name;
    importSuccess.value = `Applied schema: ${name}`;
    return true;
  };

  const loadCollection = (data: unknown): boolean => {
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

    // Validate all schemas
    const validSchemas: SchemaItem[] = [];
    for (let i = 0; i < schemas.length; i++) {
      const schema = schemas[i];
      if (!schema.name || typeof schema.name !== "string") {
        importError.value = `Schema ${i + 1}: must have a 'name' property`;
        return false;
      }

      const config = schema.config as MappingConfig | undefined;
      if (!config) {
        importError.value = `Schema '${schema.name}': must have a 'config' property`;
        return false;
      }

      if (config.version !== "1.0") {
        importError.value = `Schema '${schema.name}': unsupported version ${config.version}. Expected "1.0"`;
        return false;
      }

      if (!config.mappings || typeof config.mappings !== "object" || Array.isArray(config.mappings)) {
        importError.value = `Schema '${schema.name}': 'mappings' must be an object`;
        return false;
      }

      validSchemas.push({ name: schema.name, config });
    }

    loadedSchemas.value = validSchemas;
    selectedSchemaIndex.value = 0;
    importSuccess.value = `Loaded ${validSchemas.length} schema(s). Select one to apply.`;
    return true;
  };

  const handleImportFromText = (text: string) => {
    try {
      const data = JSON.parse(text);
      return loadCollection(data);
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
      return loadCollection(data);
    } catch (err) {
      importError.value = `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}`;
      return false;
    }
  };

  const applySelectedSchema = () => {
    const schema = loadedSchemas.value[selectedSchemaIndex.value];
    if (schema) {
      applySchemaConfig(schema.config, schema.name);
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

        {/* Schema Selector - shown when schemas are loaded */}
        {loadedSchemas.value.length > 0 && (
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label class="block text-sm text-blue-700 mb-2">Select schema to apply:</label>
            <div class="flex gap-2">
              <select
                value={selectedSchemaIndex.value}
                onChange={(e) => selectedSchemaIndex.value = parseInt((e.target as HTMLSelectElement).value)}
                class="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {loadedSchemas.value.map((schema, index) => (
                  <option key={index} value={index}>{schema.name}</option>
                ))}
              </select>
              <button
                onClick={applySelectedSchema}
                class="px-4 py-1.5 text-sm rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
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
              Fetch
            </button>
          </div>
          <button
            onClick={() => {
              const input = document.getElementById("import-json-url") as HTMLInputElement;
              input.value = EXAMPLES_SCHEMA_URL;
              handleImportFromUrl(EXAMPLES_SCHEMA_URL);
            }}
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
            Load
          </button>
        </div>

        {/* Schema Reference */}
        <details class="text-xs text-gray-500">
          <summary class="cursor-pointer hover:text-gray-700">Schema Reference</summary>
          <pre class="mt-2 p-3 bg-gray-100 rounded-lg overflow-x-auto text-xs">{`{
  "$schema": "https://csv-import-formatter.mikepage.deno.net/schemas/mapping.schema.json#/$defs/MappingCollection",
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
