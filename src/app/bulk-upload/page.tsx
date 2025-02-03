// src/app/bulk-upload/page.tsx

"use client";

import React from "react";

export default function BulkUploadPage() {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // POST to /api/bulk
    const response = await fetch("/api/bulk", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert("Error: " + (errorData.error || "Unknown error"));
      return;
    }

    // CSV text returned
    const csv = await response.text();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    // Trigger a download
    const a = document.createElement("a");
    a.href = url;
    a.download = "daily_counts.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="p-4">
      <h1 className="text-xl font-bold mb-2">
        Bulk CSV (7 Days, Excluding Today)
      </h1>
      <form
        onSubmit={handleSubmit}
        encType="multipart/form-data"
        className="space-y-3"
      >
        <div>
          <label className="font-semibold">CSV File of Keywords:</label>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="ml-2"
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-3 py-1 rounded"
        >
          Upload & Generate
        </button>
      </form>
    </main>
  );
}