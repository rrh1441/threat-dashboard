"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";

export default function CsvUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError("Please select a valid CSV file.");
    }
  };

  // If ESLint still complains that handleUpload is unused, you can disable the rule:
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/bulk", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Error uploading file.");
        return;
      }

      // Process the response as a Blob to trigger a download.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = "daily_counts.csv";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setSuccess(true);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setError("An error occurred while uploading the file.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          ref={fileInputRef}
          className="flex-grow"
        />
        <Button onClick={handleUpload} disabled={!file}>
          <UploadIcon className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="default" className="bg-green-50 border-green-200 text-green-800">
          <CheckCircleIcon className="h-4 w-4 text-green-400" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            CSV file uploaded and processed successfully.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}