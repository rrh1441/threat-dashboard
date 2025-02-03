"use client";

import { useState } from "react";
import QueryForm from "../components/QueryForm";
import ThreatChart from "../components/ThreatChart";
import CsvUpload from "../components/CsvUpload";
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

  /**
   * Fetch threat data from the API for a given list of keywords.
   * (Note: the /api/threats endpoint accepts a single keyword, so we use the first element.)
   */
  async function fetchThreatData(keywords: string[]): Promise<void> {
    setLoading(true);
    setError(null);
    setPartial(false);
    setChartData([]);

    try {
      const response = await fetch("/api/threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keywords[0] }), // Only the first keyword is used
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

  /**
   * Callback for the QueryForm (single keyword search).
   */
  function handleQuerySubmit({ keyword }: { keyword: string }): void {
    fetchThreatData([keyword]);
  }

  /**
   * Callback for the CsvUpload component (bulk upload).
   */
  function handleCsvUpload(keywords: string[]): void {
    fetchThreatData(keywords);
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-gray-900">Threat Intelligence Dashboard</CardTitle>
            <CardDescription>Analyze threat data for the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="single">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single Keyword</TabsTrigger>
                <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
              </TabsList>
              <TabsContent value="single">
                <QueryForm onSubmit={handleQuerySubmit} />
              </TabsContent>
              <TabsContent value="bulk">
                <CsvUpload onUpload={handleCsvUpload} />
              </TabsContent>
            </Tabs>

            {loading && (
              <div className="flex items-center justify-center space-x-2 text-blue-600 mt-4">
                <LoaderIcon className="animate-spin" />
                <p>Loading data (Please wait ~15 seconds for results)...</p>
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
                <ThreatChart data={chartData} />
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