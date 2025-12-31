# CSV Mapper

A web-based CSV column mapping and transformation tool built with Deno Fresh.

## Features

- **CSV Parsing**: Upload or paste CSV data with automatic encoding detection (UTF-8, Windows-1252)
- **Delimiter Detection**: Auto-detect and configure input/output delimiters (comma, semicolon, tab)
- **Column Mapping**: Rename columns from source to target names
- **Type Transformations**: Convert column data types
  - `string` - Text (default)
  - `integer` - Whole numbers
  - `number` - Decimal numbers
  - `boolean` - Boolean values (outputs as 1/0 in CSV)
- **Value Transformations**:
  - `uppercase` / `lowercase` - Case conversion
  - `trim` - Remove whitespace
  - `date` - Date formatting with configurable source/target formats
- **Number Conversion**: Configurable decimal separator (period or comma), thousand separators automatically removed
- **Import/Export**: Save and load mapping configurations as JSON

## Mapping Configuration Schema

```json
{
  "version": "1.0",
  "inputDelimiter": "," | ";" | "\t",
  "outputDelimiter": "," | ";" | "\t",
  "decimalSeparator": "." | ",",
  "mappings": {
    "sourceColumn": "targetColumn"
  },
  "typeTransformations": {
    "column": "string | integer | number | boolean"
  },
  "transformations": {
    "column": "uppercase | lowercase | trim | date | date:sourceFormat | date:sourceFormat:targetFormat"
  }
}
```

### Type Transformations

| Type | Description | Output |
|------|-------------|--------|
| `string` | Text data (default) | As-is |
| `integer` | Whole numbers | Rounded, thousand separators removed |
| `number` | Decimal numbers | Thousand separators removed |
| `boolean` | Boolean values | `1` or `0` in CSV output |

### Value Transformations

| Transformation | Description | Example |
|----------------|-------------|---------|
| `uppercase` | Convert to uppercase | `hello` → `HELLO` |
| `lowercase` | Convert to lowercase | `HELLO` → `hello` |
| `trim` | Remove whitespace | `  hello  ` → `hello` |
| `date` | Format date (default yyyy-MM-dd) | `15/01/2024` → `2024-01-15` |
| `date:sourceFormat` | Parse with source format | `date:dd/MM/yyyy` |
| `date:sourceFormat:targetFormat` | Parse and format | `date:dd/MM/yyyy:yyyy-MM-dd` |

#### Date Format Tokens

| Token | Description | Example |
|-------|-------------|---------|
| `yyyy` | 4-digit year | 2024 |
| `MM` | 2-digit month | 01-12 |
| `dd` | 2-digit day | 01-31 |
| `HH` | 2-digit hour (24h) | 00-23 |
| `mm` | 2-digit minute | 00-59 |
| `ss` | 2-digit second | 00-59 |

Invalid dates output an empty string.

### Number Parsing

Numbers are parsed based on the configured decimal separator:

| Decimal Separator | Input | Output |
|-------------------|-------|--------|
| `.` (Period) | `1,234.56` | `1234.56` |
| `,` (Comma) | `1.234,56` | `1234.56` |

Thousand separators are always removed. Output uses `.` as decimal separator.

## Usage

Make sure to install Deno: https://docs.deno.com/runtime/getting_started/installation

Start the project in development mode:

```
deno task dev
```

This will watch the project directory and restart as necessary.

## Schema

The full JSON Schema for mapping configurations is available at [`schemas/mapping.schema.json`](schemas/mapping.schema.json).
