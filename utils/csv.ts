import { parse, stringify } from "@std/csv";

export type Delimiter = "," | ";" | "\t";

export interface DelimiterInfo {
  delimiter: Delimiter;
  label: string;
}

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export const DELIMITERS: DelimiterInfo[] = [
  { delimiter: ",", label: "Comma (,)" },
  { delimiter: ";", label: "Semicolon (;)" },
  { delimiter: "\t", label: "Tab" },
];

/**
 * Parse CSV text using @std/csv
 */
export function parseCSV(text: string, delimiter: Delimiter): ParsedCSV {
  const trimmed = text.trim();
  if (!trimmed) {
    return { headers: [], rows: [] };
  }

  const records = parse(trimmed, {
    separator: delimiter,
    skipFirstRow: false,
    lazyQuotes: true,
  }) as string[][];

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0];
  const rows = records.slice(1);

  return { headers, rows };
}

export function detectDelimiter(text: string): Delimiter {
  const lines = text.trim().split("\n").slice(0, 10); // Check first 10 lines
  if (lines.length === 0) return ",";

  const counts = { ",": 0, ";": 0, "\t": 0 };

  for (const line of lines) {
    // Count delimiters outside of quoted strings
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === ",") counts[","]++;
        else if (char === ";") counts[";"]++;
        else if (char === "\t") counts["\t"]++;
      }
    }
  }

  // Check for consistent delimiter counts across lines
  const avgComma = counts[","] / lines.length;
  const avgSemi = counts[";"] / lines.length;
  const avgTab = counts["\t"] / lines.length;

  // Return delimiter with highest average count (and at least 1 per line on average)
  if (avgTab >= 1 && avgTab >= avgComma && avgTab >= avgSemi) return "\t";
  if (avgSemi >= 1 && avgSemi >= avgComma) return ";";
  return ",";
}

export function getDelimiterLabel(delimiter: Delimiter): string {
  return DELIMITERS.find((d) => d.delimiter === delimiter)?.label ?? "Comma (,)";
}

/**
 * Stringify CSV data using @std/csv with all fields quoted
 */
export function stringifyCSV(
  headers: string[],
  rows: string[][],
  delimiter: Delimiter
): string {
  if (headers.length === 0) return "";

  const data = rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? "";
    });
    return record;
  });

  // Use stringify from @std/csv, then post-process to ensure all fields are quoted
  const output = stringify(data, { columns: headers, separator: delimiter });

  // Post-process each line to ensure all fields are quoted
  const lines = output.split("\n");
  const quotedLines = lines.map((line) => {
    if (!line.trim()) return line;
    // Parse the line respecting existing quotes, then re-quote all fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current);

    // Quote all fields, escaping internal quotes
    return fields
      .map((field) => `"${field.replace(/"/g, '""')}"`)
      .join(delimiter);
  });

  return quotedLines.join("\n");
}
