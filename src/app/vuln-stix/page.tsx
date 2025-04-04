// src/app/vuln-stix/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle, Download, ArrowLeft } from 'lucide-react';

// Relative path to the Vercel function (Next.js handles routing to /api)
// NOTE: This endpoint will currently fail because vercel.json was removed.
// It needs to be restored OR the logic moved to a TS API route.
const STIX_POC_ENDPOINT = '/api/stix_poc';

interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export default function VulnStixPage() {
  const [status, setStatus] = useState<StatusMessage>({ text: 'Ready to generate.', type: 'info' });
  const [isLoading, setIsLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [bundleSizeBytes, setBundleSizeBytes] = useState<number>(0);

  // Cleanup blob URL on unmount or when new generation starts
  React.useEffect(() => {
    // Clear previous download URL if it exists when the component mounts
    // or when downloadUrl changes.
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      // Optionally reset state fully here, though clearing might be enough
      // setDownloadUrl(null);
      // setBundleSizeBytes(0);
    }
    // Return cleanup function: This runs when the component unmounts
    // or *before* the effect runs again if dependencies change.
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]); // <-- FIX 1: Added downloadUrl dependency

  const handleGenerateClick = async () => {
    setIsLoading(true);
    setStatus({ text: 'Generating STIX bundle... This can take several minutes. Please wait.', type: 'info' });
    // Revoke previous URL if it exists before starting new request
    if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
        setBundleSizeBytes(0);
    }

    try {
      // Attempt to fetch from the backend endpoint
      // NOTE: This fetch will fail until the backend API route is restored/fixed
      const response = await fetch(STIX_POC_ENDPOINT, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
      });

      const contentType = response.headers.get("content-type");

      if (response.ok && contentType && contentType.includes("application/json")) {
          // Success - response body IS the STIX bundle JSON
          const bundleBlob = await response.blob();
          // Check if it's an empty bundle (only contains definition)
          const bundleText = await bundleBlob.text(); // Read blob text to check content
          let bundleData;
          try {
              bundleData = JSON.parse(bundleText);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_parseError) { // <-- FIX 2: Prefixed unused variable
               // If parsing fails, it's not valid JSON as expected
               throw new Error("Failed to parse successful response JSON.");
          }

          // Check if the bundle contains more than just the marking definition
          if (bundleData && bundleData.objects && bundleData.objects.length > 1) {
              const url = URL.createObjectURL(bundleBlob); // Create URL only if bundle has content
              setDownloadUrl(url);
              setBundleSizeBytes(bundleBlob.size);
              setStatus({ text: `Bundle generated successfully (${(bundleBlob.size / 1024).toFixed(1)} KB). Click below to download.`, type: 'success' });
          } else {
              // API returned 200 OK but with an empty bundle (no vulns found or mapped)
              setStatus({ text: 'Warning: No vulnerabilities found matching criteria or failed to map them.', type: 'warning' });
              setDownloadUrl(null);
              setBundleSizeBytes(0);
          }

      } else {
          // Handle JSON error response from Flask or non-JSON errors
          let errorMsg = `Request failed with status ${response.status}`;
          if (contentType && contentType.includes("application/json")) {
              try {
                  const errorResult = await response.json();
                  // Use detail if available, otherwise message
                  errorMsg = errorResult?.errors?.[0]?.detail || errorResult.message || errorMsg;
              } catch (jsonError) { console.error("Could not parse error JSON:", jsonError); }
          } else {
              try {
                  const textError = await response.text();
                  errorMsg = `${response.status}: ${textError.substring(0,150)}...`;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (_textErr) { /* Ignore */ } // <-- FIX 3: Prefixed unused variable
          }
          throw new Error(errorMsg);
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: unknown) { // <-- FIX 4: Changed 'any' to 'unknown' and added type checking below
      console.error("Error generating/fetching bundle:", error);
      // Type check before accessing potentially non-existent properties
      let errorMessage = 'Generation failed or could not connect.';
      if (error instanceof Error) {
          errorMessage = error.message;
      } else if (typeof error === 'string') {
           errorMessage = error; // Handle if the error is just a string
      }
      setStatus({ text: `Error: ${errorMessage}`, type: 'error' });
      setDownloadUrl(null);
      setBundleSizeBytes(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger download from blob URL
  const triggerDownload = () => {
      if (!downloadUrl) return;
      const link = document.createElement("a");
      link.href = downloadUrl;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `stix_bundle_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Decide whether to keep the URL for re-download or clear it
      // setDownloadUrl(null); // Clearing might be better UX
      // setBundleSizeBytes(0);
  };

  return (
    <main className="p-4 md:p-8">
      <Card className="max-w-3xl mx-auto shadow-lg dark:bg-slate-950">
        <CardHeader className="border-b relative">
          {/* Back button */}
          <Link href="/" passHref legacyBehavior>
            <Button variant="outline" size="sm" className="absolute left-4 top-4">
              <ArrowLeft className="mr-2 h-4 w-4"/> Back
            </Button>
          </Link>
          {/* Title and Description - Adjusted padding */}
          <div className="pt-12 text-center sm:pt-0 sm:text-left sm:pl-24">
            <CardTitle className="text-2xl">Vulnerability to STIX Generator (POC)</CardTitle>
            <CardDescription>
              Generate & Download STIX Bundle
              {/* Indicate backend status - REMOVE/UPDATE THIS LATER */}
              <span className="text-destructive ml-2">(Backend API Disabled)</span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Click to generate a STIX bundle for vulnerabilities published in the last 14 days with public exploits, specific solutions, and remote location.
              <br />
              <strong className="text-destructive">Warning:</strong> Generation is performed live and may take up to 5 minutes, potentially timing out. (Backend currently disabled).
            </p>
            <Button onClick={handleGenerateClick} disabled={isLoading} className="w-full sm:w-auto">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Generating (takes time)...' : 'Generate STIX Bundle'}
            </Button>
          </div>

          {/* Status Message Area */}
          {status.text && (
            <Alert variant={status.type === 'error' ? 'destructive' : 'default'} className={
              status.type === 'success' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' :
              status.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' :
              status.type === 'info' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300' : ''
            }>
              {status.type === 'error' && <AlertTriangle className="h-4 w-4" />}
              {status.type === 'success' && <CheckCircle className="h-4 w-4" />}
              <AlertTitle className="font-semibold">{status.type.charAt(0).toUpperCase() + status.type.slice(1)}</AlertTitle>
              <AlertDescription>{status.text}</AlertDescription>
            </Alert>
          )}

          {/* Download Button Area */}
          {downloadUrl && status.type === 'success' && (
              <div>
                <h3 className="font-semibold mb-2">Download Bundle</h3>
                <Button onClick={triggerDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Generated Bundle ({ (bundleSizeBytes / 1024).toFixed(1) } KB)
                </Button>
              </div>
          )}

        </CardContent>
      </Card>
    </main>
  );
}