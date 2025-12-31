import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import CSVImportFormatter from "../islands/CSVImportFormatter.tsx";

export default define.page(function CSVImportFormatterPage() {
  return (
    <div class="min-h-screen bg-gray-100">
      <Head>
        <title>CSV Import Formatter - Transform & Convert CSV Data</title>
      </Head>
      <div class="px-4 py-8">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-3xl font-bold text-gray-800 mb-2">CSV Import Formatter</h1>
          <p class="text-gray-600 mb-6">
            Transform CSV columns with type conversions and value mapping.
          </p>
          <CSVImportFormatter />
        </div>
      </div>
    </div>
  );
});
