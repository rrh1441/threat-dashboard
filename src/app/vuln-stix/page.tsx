// src/app/vuln-stix/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle, Download, ArrowLeft } from 'lucide-react';

// Update API endpoint to the external backend URL
const STIX_BACKEND_URL = 'https://stix-backend.vercel.app/';

interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export default function VulnStixPage() {
  const [status, setStatus] = useState<StatusMessage>({ text: 'Ready to generate.', type: 'info' });
  const [isLoading, setIsLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [bundleSizeBytes, setBundleSizeBytes] = useState<number>(0);

  // Cleanup blob URL
  React.useEffect(() => {
    // Return cleanup function
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]); // Dependency array includes downloadUrl

  const handleGenerateClick = async () => {
    setIsLoading(true);
    setStatus({ text: 'Fetching STIX bundle from backend... This can take several minutes. Please wait.', type: 'info' });
    // Revoke previous URL if it exists
    if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
        setBundleSizeBytes(0);
    }

    try {
      // Fetch from the external backend endpoint
      const response = await fetch(STIX_BACKEND_URL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
      });

      const contentType = response.headers.get("content-type");

      if (response.ok && contentType && contentType.includes("application/json")) {
          // Success - response body IS the STIX bundle JSON
          const bundleBlob = await response.blob();
          const bundleText = await bundleBlob.text();
          let bundleData;
          try {
              bundleData = JSON.parse(bundleText);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_parseError) { // Prefixed unused variable
               throw new Error("Failed to parse successful response JSON.");
          }

          // Check if the bundle contains more than just the marking definition
          if (bundleData && bundleData.objects && bundleData.objects.length > 1) {
              const url = URL.createObjectURL(bundleBlob);
              setDownloadUrl(url);
              setBundleSizeBytes(bundleBlob.size);
              setStatus({ text: `Bundle fetched successfully (${(bundleBlob.size / 1024).toFixed(1)} KB). Click below to download.`, type: 'success' });
          } else {
              // API returned 200 OK but with an empty bundle
              setStatus({ text: 'Warning: No vulnerabilities found matching criteria or failed to map them.', type: 'warning' });
              setDownloadUrl(null);
              setBundleSizeBytes(0);
          }

      } else {
          // Handle non-OK or non-JSON responses
          let errorMsg = `Request failed with status ${response.status}`;
          if (contentType && contentType.includes("application/json")) {
              try {
                  const errorResult = await response.json();
                  errorMsg = errorResult?.errors?.[0]?.detail || errorResult.message || errorMsg;
              } catch (jsonError) { console.error("Could not parse error JSON:", jsonError); }
          } else {
              try {
                  const textError = await response.text();
                  // Try to extract useful info from non-JSON response (like HTML 404 page)
                  errorMsg = `${response.status}: ${textError.substring(0,150)}...`;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (_textErr) { /* Ignore inability to read text body */ } // Prefixed unused variable
          }
          throw new Error(errorMsg);
      }

    } catch (error: unknown) { // Use unknown
      console.error("Error fetching bundle:", error);
      // Type check before accessing message
      let errorMessage = 'Bundle fetch failed or could not connect to backend.';
      if (error instanceof Error) {
          errorMessage = error.message;
      } else if (typeof error === 'string') {
           errorMessage = error;
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
  };

  // --- JSX ---
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
          {/* Title and Description */}
          <div className="pt-12 text-center sm:pt-0 sm:text-left sm:pl-24">
            <CardTitle className="text-2xl">Vulnerability to STIX Generator (POC)</CardTitle>
            <CardDescription>
              Generate & Download STIX Bundle
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Click to generate a STIX bundle for vulnerabilities published in the last 14 days with public exploits, specific solutions, and remote location.
              <br />
              <strong className="text-destructive">Warning:</strong> Generation is performed live and may take up to 5 minutes, potentially timing out.
            </p>
            <Button onClick={handleGenerateClick} disabled={isLoading} className="w-full sm:w-auto">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Fetching bundle...' : 'Generate STIX Bundle'}
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
                  Download STIX Bundle ({ (bundleSizeBytes / 1024).toFixed(1) } KB)
                </Button>
              </div>
          )}

        </CardContent>
      </Card>
    </main>
  );
}