import { useSignal, useComputed } from "@preact/signals";
import { detectAndDecodeText } from "../utils/encoding.ts";
import {
  detectDelimiter,
  DELIMITERS,
  parseCSV,
  type Delimiter,
  type ParsedCSV,
} from "../utils/csv.ts";

type DataType = "string" | "integer" | "decimal" | "date" | "boolean" | "char";

interface Conversion {
  sourceValue: string;
  targetValue: string;
}

interface ColumnMapping {
  sourceColumn: string;
  sourceType: DataType;
  targetColumn: string;
  conversions: Conversion[];
  include: boolean;
}

const SAMPLE_CSV = `id,name,active,score,created,grade
1,John Doe,T,85.5,2024-01-15,A
2,Jane Smith,F,92.3,2024-02-20,B
3,Bob Wilson,T,78.0,2024-03-10,C
4,Alice Brown,F,88.7,2024-04-05,A
5,Charlie Davis,T,95.2,2024-05-12,B`;

function inferType(values: string[]): DataType {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "string";

  const allIntegers = nonEmpty.every((v) => /^-?\d+$/.test(v));
  if (allIntegers) return "integer";

  const allDecimals = nonEmpty.every((v) => /^-?\d+\.?\d*$/.test(v));
  if (allDecimals) return "decimal";

  const allDates = nonEmpty.every(
    (v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{2}\/\d{2}\/\d{4}/.test(v)
  );
  if (allDates) return "date";

  const allBooleans = nonEmpty.every((v) =>
    ["true", "false", "0", "1", "yes", "no", "t", "f", "y", "n"].includes(
      v.toLowerCase()
    )
  );
  if (allBooleans) return "boolean";

  const allChars = nonEmpty.every((v) => v.length === 1);
  if (allChars) return "char";

  return "string";
}

function convertValue(
  value: string,
  sourceType: DataType,
  conversions: Conversion[]
): string {
  for (const conv of conversions) {
    if (conv.sourceValue.toLowerCase() === value.toLowerCase()) {
      return conv.targetValue;
    }
  }

  switch (sourceType) {
    case "boolean": {
      const lower = value.toLowerCase();
      if (["true", "t", "yes", "y", "1"].includes(lower)) return "1";
      if (["false", "f", "no", "n", "0"].includes(lower)) return "0";
      return value;
    }
    case "integer":
      return parseInt(value, 10).toString() || value;
    case "decimal":
      return parseFloat(value).toString() || value;
    default:
      return value;
  }
}

function generateOutputCSV(
  parsedCSV: ParsedCSV,
  mappings: ColumnMapping[],
  delimiter: Delimiter
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
          mapping.conversions
        );
        if (converted.includes(delimiter) || converted.includes('"')) {
          return `"${converted.replace(/"/g, '""')}"`;
        }
        return converted;
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

  const outputCSV = useComputed(() => {
    if (parsedCSV.value.headers.length === 0) return "";
    return generateOutputCSV(parsedCSV.value, mappings.value, outputDelimiter.value);
  });

  const handleParseCSV = () => {
    // Auto-detect delimiter if not already detected
    if (inputCSV.value.trim()) {
      const detected = detectDelimiter(inputCSV.value);
      inputDelimiter.value = detected;
    }

    const parsed = parseCSV(inputCSV.value, inputDelimiter.value);
    parsedCSV.value = parsed;

    const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
      const columnValues = parsed.rows.map(
        (row) => row[parsed.headers.indexOf(header)] || ""
      );
      const detectedType = inferType(columnValues);

      return {
        sourceColumn: header,
        sourceType: detectedType,
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

      const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
        const columnValues = parsed.rows.map(
          (row) => row[parsed.headers.indexOf(header)] || ""
        );
        const detectedType = inferType(columnValues);

        return {
          sourceColumn: header,
          sourceType: detectedType,
          targetColumn: header,
          conversions: [],
          include: true,
        };
      });

      mappings.value = newMappings;
    }
  };

  const handleLoadSample = () => {
    inputCSV.value = SAMPLE_CSV;
  };

  const handleClear = () => {
    inputCSV.value = "";
    parsedCSV.value = { headers: [], rows: [] };
    mappings.value = [];
    encodingInfo.value = null;
    encodingError.value = null;
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
        </div>
      </div>

      {/* Action Buttons */}
      <div class="flex gap-3 mb-6">
        <button
          onClick={handleParseCSV}
          disabled={!inputCSV.value.trim()}
          class={`px-6 py-2 font-medium rounded-lg transition-colors ${
            !inputCSV.value.trim()
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          Parse CSV
        </button>
        <button
          onClick={handleLoadSample}
          class="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Load Sample
        </button>
        <button
          onClick={handleClear}
          class="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>

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
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="decimal">Decimal</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                          <option value="char">Char</option>
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
                                mapping.conversions
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
                            mapping.conversions
                          );
                          return (
                            <td
                              key={mapping.targetColumn}
                              class="py-2 px-4 text-gray-600 font-mono"
                            >
                              {converted}
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
