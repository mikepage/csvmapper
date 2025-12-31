import { useSignal, useComputed } from "@preact/signals";
import { detectAndDecodeText } from "../utils/encoding.ts";
import {
  detectDelimiter,
  DELIMITERS,
  parseCSV,
  type Delimiter,
  type ParsedCSV,
} from "../utils/csv.ts";
import {
  type ColumnMapping,
  type DecimalSeparator,
} from "../utils/mapping.ts";
import { applyTransformation, transformValue } from "../utils/transformation.ts";
import ImportSchema from "./ImportSchema.tsx";
import ExportSchema from "./ExportSchema.tsx";
import ColumnMappingIsland from "./ColumnMapping.tsx";
import ExampleSelector from "./ExampleSelector.tsx";

const DECIMAL_SEPARATORS: { separator: DecimalSeparator; label: string }[] = [
  { separator: ".", label: "Period (1,234.56)" },
  { separator: ",", label: "Comma (1.234,56)" },
];

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
        const converted = transformValue(
          value,
          mapping.sourceType,
          mapping.conversions,
          decimalSeparator
        );
        const transformed = applyTransformation(converted, mapping.transformation);
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

export default function CSVImportFormatter() {
  const inputCSV = useSignal("");
  const parsedCSV = useSignal<ParsedCSV>({ headers: [], rows: [] });
  const mappings = useSignal<ColumnMapping[]>([]);
  const encodingInfo = useSignal<string | null>(null);
  const encodingError = useSignal<string | null>(null);
  const inputDelimiter = useSignal<Delimiter>(";");
  const outputDelimiter = useSignal<Delimiter>(";");
  const decimalSeparator = useSignal<DecimalSeparator>(",");
  const importError = useSignal<string | null>(null);
  const importSuccess = useSignal<string | null>(null);
  const schemaName = useSignal("Untitled");

  const outputCSV = useComputed(() => {
    if (parsedCSV.value.headers.length === 0) return "";
    return generateOutputCSV(parsedCSV.value, mappings.value, outputDelimiter.value, decimalSeparator.value);
  });

  const handleParseCSV = () => {
    if (inputCSV.value.trim()) {
      const detected = detectDelimiter(inputCSV.value);
      inputDelimiter.value = detected;
    }

    const parsed = parseCSV(inputCSV.value, inputDelimiter.value);
    parsedCSV.value = parsed;

    const existingMappingsMap = new Map(
      mappings.value.map((m) => [m.sourceColumn, m])
    );

    const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
      const existing = existingMappingsMap.get(header);
      if (existing) {
        return { ...existing };
      }
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
      const parsed = parseCSV(inputCSV.value, newDelimiter);
      parsedCSV.value = parsed;

      const existingMappingsMap = new Map(
        mappings.value.map((m) => [m.sourceColumn, m])
      );

      const newMappings: ColumnMapping[] = parsed.headers.map((header) => {
        const existing = existingMappingsMap.get(header);
        if (existing) {
          return { ...existing };
        }
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

  const handleClear = () => {
    inputCSV.value = "";
    parsedCSV.value = { headers: [], rows: [] };
    mappings.value = [];
    encodingInfo.value = null;
    encodingError.value = null;
    importError.value = null;
    importSuccess.value = null;
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

        <div class="mt-3 grid grid-cols-3 gap-4">
          <div>
            <label class="block text-sm text-gray-600 mb-1">Input delimiter</label>
            <select
              value={inputDelimiter.value}
              onChange={(e) => handleInputDelimiterChange((e.target as HTMLSelectElement).value as Delimiter)}
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DELIMITERS.map((d) => (
                <option key={d.delimiter} value={d.delimiter}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">Output delimiter</label>
            <select
              value={outputDelimiter.value}
              onChange={(e) => outputDelimiter.value = (e.target as HTMLSelectElement).value as Delimiter}
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DELIMITERS.map((d) => (
                <option key={d.delimiter} value={d.delimiter}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-600 mb-1">Decimal separator</label>
            <select
              value={decimalSeparator.value}
              onChange={(e) => decimalSeparator.value = (e.target as HTMLSelectElement).value as DecimalSeparator}
              class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DECIMAL_SEPARATORS.map((d) => (
                <option key={d.separator} value={d.separator}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action Buttons and Example Selector */}
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
          Format CSV
        </button>
        <button
          onClick={handleClear}
          class="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
        <div class="ml-auto">
          <ExampleSelector
            inputCSV={inputCSV}
            parsedCSV={parsedCSV}
            mappings={mappings}
            inputDelimiter={inputDelimiter}
            encodingInfo={encodingInfo}
          />
        </div>
      </div>

      {/* Import Schema - always visible, expanded by default */}
      <ImportSchema
        mappings={mappings}
        parsedCSV={parsedCSV}
        inputDelimiter={inputDelimiter}
        outputDelimiter={outputDelimiter}
        decimalSeparator={decimalSeparator}
        importError={importError}
        importSuccess={importSuccess}
        schemaName={schemaName}
      />

      {/* Export Schema - collapsed by default */}
      <ExportSchema
        mappings={mappings}
        inputDelimiter={inputDelimiter}
        outputDelimiter={outputDelimiter}
        decimalSeparator={decimalSeparator}
        schemaName={schemaName}
      />

      {/* Mapping Configuration */}
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

          {/* Column Mapping - collapsed by default */}
          <ColumnMappingIsland
            mappings={mappings}
            parsedCSV={parsedCSV}
            decimalSeparator={decimalSeparator}
          />
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
                          const converted = transformValue(
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
