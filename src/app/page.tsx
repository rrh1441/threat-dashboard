"use client";

import { useState } from "react";
import QueryForm from "../components/QueryForm";
import ThreatChart from "../components/ThreatChart";
import CsvUpload from "../components/CsvUpload"; // Bulk Search – Communities (7d)
import CsvUploadMarkets from "../components/CsvUploadMarkets"; // Bulk Search – Marketplaces (7d)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InfoIcon, AlertTriangleIcon, LoaderIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SingleDayResponse {
  day: string;
  total?: {
    value: number;
    relation: string;
  };
  [key: string]: unknown;
}

interface MultiDayResponse {
  partial: boolean;
  data: SingleDayResponse[];
}

export default function Home() {
  const [chartData, setChartData] = useState<Array<{ date: string; count: number }>>([]);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentKeyword, setCurrentKeyword] = useState<string>("");

  // For Keyword (7d) search (calls /api/threats)
  async function handleQuerySubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword);
    setLoading(true);
    setError(null);
    setPartial(false);
    setChartData([]);

    try {
      const response = await fetch("/api/threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch data. Status=${response.status}`);
      }
      const json: MultiDayResponse = await response.json();
      setPartial(json.partial);
      const newChartData = json.data
        .map((dayObj) => ({
          date: dayObj.day,
          count: dayObj.total?.value ?? 0,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      setChartData(newChartData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  // For Keyword - Monthly search (calls /api/monthly)
  async function handleMonthlySubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch monthly data. Status=${response.status}`);
      }
      // Read response as a blob and trigger a download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = "monthly_counts.csv";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  // For Keyword (365d) search (calls /api/yearly)
  async function handleAnnualSubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/yearly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch annual data. Status=${response.status}`);
      }
      // Read response as a blob and trigger a download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = "annual_counts.csv";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-gray-900">
              Threat Intelligence Dashboard {currentKeyword && `for "${currentKeyword}"`}
            </CardTitle>
            <CardDescription>FP Deep and Dark Web Results</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="keyword">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="keyword" className="data-[state=active]:bg-gray-200">
                  Keyword (7d)
                </TabsTrigger>
                <TabsTrigger value="monthly" className="data-[state=active]:bg-gray-200">
                  Keyword - Monthly
                </TabsTrigger>
                <TabsTrigger value="annual" className="data-[state=active]:bg-gray-200">
                  Keyword (365d)
                </TabsTrigger>
                <TabsTrigger value="bulk-communities" className="data-[state=active]:bg-gray-200">
                  Bulk Search – Communities (7d)
                </TabsTrigger>
                <TabsTrigger value="bulk-markets" className="data-[state=active]:bg-gray-200">
                  Bulk Search – Marketplaces (7d)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="keyword">
                <QueryForm onSubmit={handleQuerySubmit} placeholder="Enter keyword..." />
              </TabsContent>
              <TabsContent value="monthly">
                <QueryForm onSubmit={handleMonthlySubmit} placeholder="Enter keyword for monthly search..." />
              </TabsContent>
              <TabsContent value="annual">
                <QueryForm onSubmit={handleAnnualSubmit} placeholder="Enter keyword for annual search..." />
              </TabsContent>
              <TabsContent value="bulk-communities">
                <CsvUpload />
              </TabsContent>
              <TabsContent value="bulk-markets">
                <CsvUploadMarkets />
              </TabsContent>
            </Tabs>

            {loading && (
              <div className="flex items-center justify-center space-x-2 text-blue-600 mt-4">
                <LoaderIcon className="animate-spin" />
                <p>Loading data (Please wait ~3 minutes for results)...</p>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {partial && !error && (
              <Alert variant="default" className="mt-4">
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  We hit a rate limit or error partway. Showing partial results.
                </AlertDescription>
              </Alert>
            )}

            {chartData.length > 0 && (
              <div className="mt-8">
                <ThreatChart data={chartData} keyword={currentKeyword} />
              </div>
            )}

            {!loading && !error && chartData.length === 0 && (
              <Alert className="mt-4">
                <InfoIcon className="h-4 w-4" />
                <AlertTitle>No Data</AlertTitle>
                <AlertDescription>
                  Enter a keyword or upload a CSV file to start analyzing threat data.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}