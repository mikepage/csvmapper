import { useSignal, useSignalEffect, type Signal } from "@preact/signals";
import { detectDelimiter, parseCSV, type Delimiter, type ParsedCSV } from "../utils/csv.ts";
import { type ColumnMapping, type DataType, type DecimalSeparator, type MappingConfigTypeTransformation, type MappingConfigTransformation } from "../utils/mapping.ts";

interface Example {
  id: string;
  name: string;
  description: string;
  csv: string;
  mapping: string;
}

interface ExamplesProps {
  inputCSV: Signal<string>;
  parsedCSV: Signal<ParsedCSV>;
  mappings: Signal<ColumnMapping[]>;
  inputDelimiter: Signal<Delimiter>;
  encodingInfo: Signal<string | null>;
  importError: Signal<string | null>;
  importSuccess: Signal<string | null>;
}

export default function Examples({
  inputCSV,
  parsedCSV,
  mappings,
  inputDelimiter,
  encodingInfo,
  importError,
  importSuccess,
}: ExamplesProps) {
  const examples = useSignal<Example[]>([]);
  const selectedExample = useSignal<string>("");
  const loading = useSignal(false);

  useSignalEffect(() => {
    fetch("/examples/index.json")
      .then((res) => res.json())
      .then((data) => {
        examples.value = data.schemas;
      })
      .catch(() => {});
  });

  const loadExample = async (example: Example) => {
    loading.value = true;
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
      const initialMappings: ColumnMapping[] = parsed.headers.map((header) => ({
        sourceColumn: header,
        sourceType: "",
        targetColumn: header,
        conversions: [],
        include: true,
      }));
      mappings.value = initialMappings;

      // Load and apply mapping config
      const mappingResponse = await fetch(`/examples/${example.mapping}`);
      if (!mappingResponse.ok) throw new Error(`Failed to load mapping: ${mappingResponse.statusText}`);
      const config = await mappingResponse.json();

      // Apply mapping config directly
      if (config.inputDelimiter) {
        inputDelimiter.value = config.inputDelimiter as Delimiter;
      }

      const mappingsObj = config.mappings as Record<string, string>;
      const typeTransformationsObj = (config.typeTransformations || {}) as Record<string, MappingConfigTypeTransformation>;
      const transformationsObj = (config.transformations || {}) as Record<string, MappingConfigTransformation>;
      const valueConversionsObj = (config.valueConversions || {}) as Record<string, Record<string, string>>;

      const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
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
      selectedExample.value = example.id;
      encodingInfo.value = "UTF-8";
      importSuccess.value = `Loaded example: ${example.name}`;
    } catch (err) {
      importError.value = `Failed to load example: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      loading.value = false;
    }
  };

  if (examples.value.length === 0) {
    return null;
  }

  return (
    <details class="bg-white rounded-lg shadow border border-gray-200">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
        Examples
      </summary>
      <div class="px-4 py-4 border-t border-gray-200">
        <div class="grid gap-3">
          {examples.value.map((example) => (
            <button
              key={example.id}
              onClick={() => loadExample(example)}
              disabled={loading.value}
              class={`text-left p-3 rounded-lg border transition-colors ${
                selectedExample.value === example.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
              } ${loading.value ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div class="font-medium text-gray-800">{example.name}</div>
              <div class="text-sm text-gray-500 mt-1">{example.description}</div>
            </button>
          ))}
        </div>
        {loading.value && (
          <div class="mt-3 text-sm text-gray-500 text-center">Loading...</div>
        )}
      </div>
    </details>
  );
}
