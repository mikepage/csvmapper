export type DecodeResult =
  | { text: string; encoding: string }
  | { error: string };

export function detectAndDecodeText(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-8 BOM
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder("utf-8").decode(buffer), encoding: "UTF-8 (BOM)" };
  }

  // Check for UTF-16 LE BOM
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder("utf-16le").decode(buffer), encoding: "UTF-16 LE" };
  }

  // Check for UTF-16 BE BOM
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder("utf-16be").decode(buffer), encoding: "UTF-16 BE" };
  }

  // Validate UTF-8 byte sequences
  if (isValidUtf8(bytes)) {
    return { text: new TextDecoder("utf-8").decode(buffer), encoding: "UTF-8" };
  }

  // Check for Windows-1252/ISO-8859-1 (Latin-1)
  const { hasHighBytes, hasWindows1252Specific } = analyzeHighBytes(bytes);

  if (hasHighBytes) {
    try {
      const encoding = hasWindows1252Specific ? "windows-1252" : "iso-8859-1";
      const text = new TextDecoder(encoding).decode(buffer);
      return {
        text,
        encoding: hasWindows1252Specific
          ? "Windows-1252 (converted to UTF-8)"
          : "ISO-8859-1/Latin-1 (converted to UTF-8)",
      };
    } catch {
      return {
        error: "Invalid encoding: Unable to decode file. Please ensure the file is UTF-8, ISO-8859-1, or Windows-1252 encoded.",
      };
    }
  }

  // Default to UTF-8 for ASCII-only content
  return { text: new TextDecoder("utf-8").decode(buffer), encoding: "ASCII/UTF-8" };
}

function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      i++;
    } else if (bytes[i] >= 0xC2 && bytes[i] <= 0xDF) {
      if (i + 1 >= bytes.length || bytes[i + 1] < 0x80 || bytes[i + 1] > 0xBF) {
        return false;
      }
      i += 2;
    } else if (bytes[i] >= 0xE0 && bytes[i] <= 0xEF) {
      if (i + 2 >= bytes.length) return false;
      if (bytes[i] === 0xE0 && (bytes[i + 1] < 0xA0 || bytes[i + 1] > 0xBF)) return false;
      if (bytes[i + 1] < 0x80 || bytes[i + 1] > 0xBF || bytes[i + 2] < 0x80 || bytes[i + 2] > 0xBF) {
        return false;
      }
      i += 3;
    } else if (bytes[i] >= 0xF0 && bytes[i] <= 0xF4) {
      if (i + 3 >= bytes.length) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

function analyzeHighBytes(bytes: Uint8Array): { hasHighBytes: boolean; hasWindows1252Specific: boolean } {
  let hasHighBytes = false;
  let hasWindows1252Specific = false;

  for (let j = 0; j < bytes.length; j++) {
    if (bytes[j] >= 0x80) {
      hasHighBytes = true;
      // Windows-1252 specific characters (0x80-0x9F range)
      if (bytes[j] >= 0x80 && bytes[j] <= 0x9F) {
        hasWindows1252Specific = true;
      }
    }
  }

  return { hasHighBytes, hasWindows1252Specific };
}
