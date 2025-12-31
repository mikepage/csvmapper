export type Delimiter = "," | ";" | "\t";

export interface DelimiterInfo {
  delimiter: Delimiter;
  label: string;
}

export const DELIMITERS: DelimiterInfo[] = [
  { delimiter: ",", label: "Comma (,)" },
  { delimiter: ";", label: "Semicolon (;)" },
  { delimiter: "\t", label: "Tab" },
];

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
