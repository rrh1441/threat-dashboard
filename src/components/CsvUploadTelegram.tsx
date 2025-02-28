"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";

export default function CsvUploadTelegram() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setWarning(null);
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setError(null);
      setDownloadUrl(null);
    } else {
      setFile(null);
      setError("Please select a valid CSV file.");
      setDownloadUrl(null);
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }
    // Read CSV file as text and count non-empty lines
    const csvText = await file.text();
    const lines = csvText.split("\n").filter((line) => line.trim() !== "");
    if (lines.length > 80) {
      setWarning("Warning: Please do not upload a CSV with more than 80 lines.");
      return;
    }
    setProcessing(true);
    setError(null);
    setWarning(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Error uploading file.");
        setProcessing(false);
        return;
      }
      // Get the response blob (CSV file)
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
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
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "telegram_counts.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
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
      {warning && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}
      {processing && (
        <Alert variant="default" className="mt-4">
          <AlertTitle>Processing</AlertTitle>
          <AlertDescription>
            Upload received, please wait to download results...
          </AlertDescription>
        </Alert>
      )}
      {downloadUrl && (
        <div className="mt-4 space-y-2">
          <Alert variant="default">
            <CheckCircleIcon className="h-4 w-4 text-green-400" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>Your CSV is ready for download.</AlertDescription>
          </Alert>
          <Button onClick={handleDownload}>Download CSV</Button>
        </div>
      )}
    </div>
  );
}