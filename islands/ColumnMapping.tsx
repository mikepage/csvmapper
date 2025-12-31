import { useSignal, type Signal } from "@preact/signals";
import {
  type ColumnMapping as ColumnMappingType,
  type Conversion,
  type DataType,
  type DecimalSeparator,
} from "../utils/mapping.ts";
import { type ParsedCSV } from "../utils/csv.ts";
import { transformValue } from "../utils/transformation.ts";

interface ColumnMappingProps {
  mappings: Signal<ColumnMappingType[]>;
  parsedCSV: Signal<ParsedCSV>;
  decimalSeparator: Signal<DecimalSeparator>;
}

export default function ColumnMapping({
  mappings,
  parsedCSV,
  decimalSeparator,
}: ColumnMappingProps) {
  const expandedMapping = useSignal<number | null>(null);

  const updateMapping = (index: number, updates: Partial<ColumnMappingType>) => {
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

  return (
    <details class="bg-white rounded-lg shadow border border-gray-200">
      <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
        Column Mapping
      </summary>
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
                    <option value="">--</option>
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
                              x
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
                        const converted = transformValue(
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
    </details>
  );
}
