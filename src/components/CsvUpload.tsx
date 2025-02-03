"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";

export interface CsvUploadProps {
  // onUpload is no longer used externally since the component handles its own state.
}

export default function CsvUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setError(null);
      setSuccess(false);
      setDownloadUrl(null);
    } else {
      setFile(null);
      setError("Please select a valid CSV file.");
      setSuccess(false);
      setDownloadUrl(null);
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }

    setError(null);
    setSuccess(false);
    setProcessing(true);

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
        setProcessing(false);
        return;
      }

      // Instead of automatically triggering a download,
      // create a URL for the returned CSV Blob and store it in state.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setSuccess(true);
    } catch {
      setError("An error occurred while uploading the file.");
    } finally {
      setProcessing(false);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = (): void => {
    if (downloadUrl) {
      // Open the URL in a new tab/window to trigger download.
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = "daily_counts.csv";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      // Optionally, revoke the object URL later:
      // URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null); // Clear the URL after download if desired.
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
        <Button onClick={handleUpload} disabled={!file || processing}>
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

      {processing && (
        <Alert variant="default" className="mt-4">
          <AlertTitle>Processing</AlertTitle>
          <AlertDescription>Upload received, please wait to download results...</AlertDescription>
        </Alert>
      )}

      {success && !downloadUrl && !processing && (
        <Alert variant="default" className="mt-4">
          <CheckCircleIcon className="h-4 w-4 text-green-400" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>CSV file processed successfully.</AlertDescription>
        </Alert>
      )}

      {downloadUrl && (
        <Button className="mt-4" onClick={handleDownload}>
          Download CSV
        </Button>
      )}
    </div>
  );
}