"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";

interface CsvUploadProps {
  onUpload: (keywords: string[]) => void;
}

export default function CsvUpload({ onUpload }: CsvUploadProps) {
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

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }

    try {
      // Read the CSV file as text
      const csvText = await file.text();
      // Split the file into lines and extract keywords (trimmed and filtered)
      const keywords = csvText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      // Call the onUpload callback with the keywords
      onUpload(keywords);
      setSuccess(true);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setError("An error occurred while processing the file.");
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