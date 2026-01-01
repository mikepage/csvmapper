import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import CSVImportFormatter from "../islands/CSVImportFormatter.tsx";

export default define.page(function CSVImportFormatterPage() {
  return (
    <div class="min-h-screen bg-[#fafafa]">
      <Head>
        <title>CSV Import Formatter</title>
      </Head>
      <div class="px-6 md:px-12 py-8">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl font-normal text-[#111] tracking-tight mb-2">
            CSV Import Formatter
          </h1>
          <p class="text-[#666] text-sm mb-8">
            Transform CSV columns with type conversions and value mapping.
          </p>
          <CSVImportFormatter />
        </div>
      </div>
    </div>
  );
});
