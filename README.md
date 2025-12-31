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
- **Value Conversions**: Map specific values to other values (e.g., `Mr` → `male`, `Ms` → `female`)
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
  },
  "valueConversions": {
    "column": { "sourceValue": "targetValue" }
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
| `date` | Auto-detect input, output yyyy-MM-dd | `15/01/2024` → `2024-01-15` |
| `date:targetFormat` | Auto-detect input, custom output | `date:dd/MM/yyyy` |
| `date:sourceFormat:targetFormat` | Explicit source and target | `date:MM/dd/yyyy:yyyy-MM-dd` |

#### Auto-detected Date Formats

The following input formats are automatically detected (EU formats only):
- `yyyy-MM-dd` (ISO)
- `dd/MM/yyyy`
- `dd-MM-yyyy`
- `dd.MM.yyyy`
- `yyyy/MM/dd`

For US formats like `MM/dd/yyyy`, use explicit source format: `date:MM/dd/yyyy:yyyy-MM-dd`

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

### Value Conversions

Map specific input values to output values. Matching is case-insensitive.

```json
{
  "valueConversions": {
    "title": {
      "Mr": "male",
      "Ms": "female",
      "Mrs": "female"
    },
    "status": {
      "A": "Active",
      "I": "Inactive",
      "P": "Pending"
    }
  }
}
```

| Input | Output |
|-------|--------|
| `Mr` | `male` |
| `ms` | `female` |
| `MRS` | `female` |

### Number Parsing

Numbers are parsed based on the configured decimal separator:

| Decimal Separator | Input | Output |
|-------------------|-------|--------|
| `.` (Period) | `1,234.56` | `1234.56` |
| `,` (Comma) | `1.234,56` | `1234.56` |

Thousand separators are always removed. Output uses `.` as decimal separator.

## Examples

The `static/examples/` directory contains example CSV files with matching mapping configurations:

| Example | Description |
|---------|-------------|
| `employees` | EU format: numbers `1.234,56`, dates `dd/MM/yyyy` → `yyyy-MM-dd`, title → gender (`Mr` → `male`) |
| `products` | US format: numbers `1,234.56`, dates `yyyy-MM-dd`, availability (`yes`/`no` → `1`/`0`) |

Load examples directly from the UI using the "Load example" dropdown.

### Example Structure

```
static/examples/
├── index.json           # Example registry
├── employees.csv        # Employee CSV data
├── employees.mapping.json
├── products.csv         # Product CSV data
└── products.mapping.json
```

## Usage

Make sure to install Deno: https://docs.deno.com/runtime/getting_started/installation

Start the project in development mode:

```
deno task dev
```

This will watch the project directory and restart as necessary.

## Schema

The full JSON Schema for mapping configurations is available at [`schemas/mapping.schema.json`](schemas/mapping.schema.json).
