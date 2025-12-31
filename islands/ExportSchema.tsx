import { type Signal } from "@preact/signals";
import {
  exportMappingConfig,
  type ColumnMapping,
  type DecimalSeparator,
  type MappingConfig,
} from "../utils/mapping.ts";
import { type Delimiter } from "../utils/csv.ts";

interface SchemaItem {
  name: string;
  config: MappingConfig;
}

interface MappingCollection {
  $schema: string;
  schemas: SchemaItem[];
}

interface ExportSchemaProps {
  mappings: Signal<ColumnMapping[]>;
  inputDelimiter: Signal<Delimiter>;
  outputDelimiter: Signal<Delimiter>;
  decimalSeparator: Signal<DecimalSeparator>;
  schemaName: Signal<string>;
}

export default function ExportSchema({
  mappings,
  inputDelimiter,
  outputDelimiter,
  decimalSeparator,
  schemaName,
}: ExportSchemaProps) {
  const getMappingConfig = (): MappingConfig => {
    return exportMappingConfig({
      mappings: mappings.value,
      inputDelimiter: inputDelimiter.value,
      outputDelimiter: outputDelimiter.value,
      decimalSeparator: decimalSeparator.value,
    });
  };

  const getCollection = (): MappingCollection => {
    return {
      $schema: "https://csvmapper.mikepage.deno.net/schemas/mapping.schema.json#/$defs/MappingCollection",
      schemas: [
        {
          name: schemaName.value,
          config: getMappingConfig(),
        },
      ],
    };
  };

  const getFormattedJson = (): string => {
    const collection = getCollection();
    return JSON.stringify(collection, null, 2);
  };

  const downloadMappingJson = () => {
    const json = getFormattedJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapping-collection.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMappingJson = () => {
    const json = getFormattedJson();
    navigator.clipboard.writeText(json);
  };

  return (
    <details class="bg-white rounded-lg shadow border border-gray-200">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
        Export Schema
      </summary>
      <div class="px-4 py-4 border-t border-gray-200 space-y-4">
        <div class="flex items-center gap-2 mb-3">
          <label class="text-sm text-gray-600">Schema name:</label>
          <input
            type="text"
            value={schemaName.value}
            onInput={(e) => schemaName.value = (e.target as HTMLInputElement).value}
            class="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
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
    </details>
  );
}
