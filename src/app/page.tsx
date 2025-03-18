"use client"

import { useState } from "react"
import QueryForm from "@/components/QueryForm"
import ThreatChart from "@/components/ThreatChart"
import CsvUpload from "@/components/CsvUpload"
import CsvUploadMarkets from "@/components/CsvUploadMarkets"
import CsvUploadTelegram from "@/components/CsvUploadTelegram"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InfoIcon, AlertTriangle, Loader2, BarChart3 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface SingleDayResponse {
  day: string
  total?: {
    value: number
    relation: string
  }
  [key: string]: unknown
}

interface MultiDayResponse {
  partial: boolean
  data: SingleDayResponse[]
}

export default function Home() {
  const [chartData, setChartData] = useState<Array<{ date: string; count: number }>>([])
  const [partial, setPartial] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentKeyword, setCurrentKeyword] = useState<string>("")

  // For Keyword (7d) search (calls /api/threats)
  async function handleQuerySubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword)
    setLoading(true)
    setError(null)
    setPartial(false)
    setChartData([])

    try {
      const response = await fetch("/api/threats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch data. Status=${response.status}`)
      }
      const json: MultiDayResponse = await response.json()
      setPartial(json.partial)
      const newChartData = json.data
        .map((dayObj) => ({
          date: dayObj.day,
          count: dayObj.total?.value ?? 0,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
      setChartData(newChartData)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unknown error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  // For Keyword (365d) search (calls /api/yearly)
  async function handleAnnualSubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword)
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/yearly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch annual data. Status=${response.status}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const downloadLink = document.createElement("a")
      downloadLink.href = url
      downloadLink.download = "annual_counts.csv"
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unknown error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  // For Keyword - Monthly search (calls /api/monthly)
  async function handleMonthlySubmit({ keyword }: { keyword: string }): Promise<void> {
    setCurrentKeyword(keyword)
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch monthly data. Status=${response.status}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const downloadLink = document.createElement("a")
      downloadLink.href = url
      downloadLink.download = "monthly_counts.csv"
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("An unknown error occurred.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <Card className="border-0 shadow-lg dark:bg-slate-950">
          <CardHeader className="pb-2 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10 text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">
                  Threat Intelligence Dashboard
                  {currentKeyword && (
                    <span className="ml-2 text-foreground text-xl font-normal">
                      for &quot;<span className="font-semibold">{currentKeyword}</span>&quot;
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-muted-foreground">FP Deep and Dark Web Results</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs defaultValue="keyword" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 gap-1 p-1 bg-muted/50 rounded-lg">
                <TabsTrigger value="keyword" className="text-xs md:text-sm">
                  Keyword (7d)
                </TabsTrigger>
                <TabsTrigger value="annual" className="text-xs md:text-sm">
                  Keyword (365d)
                </TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs md:text-sm">
                  Keyword - Monthly
                </TabsTrigger>
                <TabsTrigger value="bulk-communities" className="text-xs md:text-sm">
                  Bulk - Communities
                </TabsTrigger>
                <TabsTrigger value="bulk-markets" className="text-xs md:text-sm">
                  Bulk - Markets
                </TabsTrigger>
                <TabsTrigger value="bulk-telegram" className="text-xs md:text-sm">
                  Bulk - Telegram
                </TabsTrigger>
              </TabsList>

              <div className="bg-card rounded-lg p-4 border shadow-sm">
                <TabsContent value="keyword" className="mt-0">
                  <QueryForm onSubmit={handleQuerySubmit} placeholder="Enter keyword..." />
                </TabsContent>
                <TabsContent value="annual" className="mt-0">
                  <QueryForm onSubmit={handleAnnualSubmit} placeholder="Enter keyword for annual search..." />
                </TabsContent>
                <TabsContent value="monthly" className="mt-0">
                  <QueryForm onSubmit={handleMonthlySubmit} placeholder="Enter keyword for monthly search..." />
                </TabsContent>
                <TabsContent value="bulk-communities" className="mt-0">
                  <CsvUpload />
                </TabsContent>
                <TabsContent value="bulk-markets" className="mt-0">
                  <CsvUploadMarkets />
                </TabsContent>
                <TabsContent value="bulk-telegram" className="mt-0">
                  <CsvUploadTelegram />
                </TabsContent>
              </div>

              {loading && (
                <div className="flex items-center justify-center space-x-3 text-primary p-4 bg-primary/5 rounded-lg border border-primary/20 animate-pulse">
                  <Loader2 className="animate-spin h-5 w-5" />
                  <p className="font-medium">Loading data (Please wait ~3 minutes for results)...</p>
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="border border-destructive/20">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle className="font-semibold">Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {partial && !error && (
                <Alert
                  variant="warning"
                  className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                >
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="font-semibold text-amber-800 dark:text-amber-300">Warning</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    We hit a rate limit or error partway. Showing partial results.
                  </AlertDescription>
                </Alert>
              )}

              {chartData.length > 0 && (
                <div className="mt-6 bg-card rounded-lg p-4 border shadow-sm">
                  <h3 className="text-lg font-semibold mb-4">Threat Analysis Results</h3>
                  <ThreatChart data={chartData} keyword={currentKeyword} />
                </div>
              )}

              {!loading && !error && chartData.length === 0 && (
                <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <InfoIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <AlertTitle className="font-semibold text-blue-800 dark:text-blue-300">No Data</AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-400">
                    Enter a keyword or upload a CSV file to start analyzing threat data.
                  </AlertDescription>
                </Alert>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

