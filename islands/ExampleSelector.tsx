import { type Signal } from "@preact/signals";
import { detectDelimiter, parseCSV, type Delimiter, type ParsedCSV } from "../utils/csv.ts";
import { type ColumnMapping } from "../utils/mapping.ts";

interface ExampleSelectorProps {
  inputCSV: Signal<string>;
  parsedCSV: Signal<ParsedCSV>;
  mappings: Signal<ColumnMapping[]>;
  inputDelimiter: Signal<Delimiter>;
  encodingInfo: Signal<string | null>;
}

const EXAMPLES = [
  { id: "employees", name: "Employees", file: "employees.csv" },
  { id: "products", name: "Products", file: "products.csv" },
];

export default function ExampleSelector({
  inputCSV,
  parsedCSV,
  mappings,
  inputDelimiter,
  encodingInfo,
}: ExampleSelectorProps) {
  const loadExample = async (file: string) => {
    try {
      const response = await fetch(`/examples/${file}`);
      if (!response.ok) return;
      const csvText = await response.text();
      inputCSV.value = csvText;

      const detected = detectDelimiter(csvText);
      inputDelimiter.value = detected;
      const parsed = parseCSV(csvText, detected);
      parsedCSV.value = parsed;

      const initialMappings: ColumnMapping[] = parsed.headers.map((header) => ({
        sourceColumn: header,
        sourceType: "",
        targetColumn: header,
        conversions: [],
        include: true,
      }));
      mappings.value = initialMappings;
      encodingInfo.value = "UTF-8";
    } catch {
      // Silently fail
    }
  };

  return (
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-600">Example CSV:</span>
      {EXAMPLES.map((ex) => (
        <button
          key={ex.id}
          onClick={() => loadExample(ex.file)}
          class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
        >
          {ex.name}
        </button>
      ))}
    </div>
  );
}
