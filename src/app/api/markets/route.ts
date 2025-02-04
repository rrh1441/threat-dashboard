// src/app/api/markets/route.ts

import { NextResponse } from "next/server";
import { parse as parseCSV } from "papaparse";
import { Parser as JSON2CSVParser } from "json2csv";

// Force this route to run in the Node.js runtime.
export const runtime = "nodejs";

/**
 * Returns an array of the last 7 full days (excluding today)
 */
function getLast7DaysExcludingToday(): string[] {
  const days: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 1); // Exclude today

  for (let i = 6; i >= 0; i--) {
    const temp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(temp.toISOString().split("T")[0]);
  }
  return days;
}

/**
 * Constructs the payload for the Markets API query.
 */
function buildDailyPayload(keyword: string, day: string) {
  return {
    page: 0,
    size: 0,
    highlight: { enabled: true },
    query: keyword,
    include: {
      date: {
        start: `${day}T00:00:00Z`,
        end: `${day}T23:59:59Z`,
      },
    },
  };
}

/**
 * Calls the Markets API for a given keyword and day.
 * Returns the count as a number.
 */
async function fetchDailyTotal(keyword: string, day: string): Promise<number> {
  const payload = buildDailyPayload(keyword, day);
  
  const apiResponse = await fetch(process.env.MARKETS_API_URL as string, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Use MARKETS_API_KEY if defined; otherwise fall back to THREAT_API_KEY.
      Authorization: `Bearer ${process.env.MARKETS_API_KEY || process.env.THREAT_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`Day ${day} for keyword "${keyword}" => ${apiResponse.status}: ${errorText}`);
  }

  const data = await apiResponse.json();
  return data?.total?.value ?? 0;
}

/**
 * The POST handler for the bulk Markets API endpoint.
 *
 * Expects a multipart/form-data POST with a file field named "file".
 * The CSV file should contain one keyword per row (first column).
 * Returns a CSV file as an attachment with daily counts for each keyword,
 * and replaces the header row to show actual dates.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const csvText = await file.text();

    const { data: rows }: { data: string[][] } = parseCSV(csvText, {
      header: false,
      skipEmptyLines: true,
    });

    const keywords: string[] = rows.map((row: string[]) => row[0]).filter(Boolean);
    if (keywords.length === 0) {
      return NextResponse.json({ error: "CSV is empty or invalid" }, { status: 400 });
    }

    const days = getLast7DaysExcludingToday();
    const results: Array<Record<string, number | string>> = [];

    // For each keyword in the CSV file
    for (const keyword of keywords) {
      const rowData: Record<string, number | string> = { keyword };
      // For each day, fetch the count using the internal key "day1", "day2", etc.
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        try {
          const count = await fetchDailyTotal(keyword, day);
          rowData[`day${i + 1}`] = count;
        } catch (error) {
          console.error(`Error processing keyword "${keyword}" on ${day}:`, error);
          rowData[`day${i + 1}`] = 0;
        }
        // Delay between calls (adjust delay value as needed)
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      results.push(rowData);
    }

    // Build header fields using the internal keys
    const fields = ["keyword", ...days.map((_, i) => `day${i + 1}`)];
    const json2csvParser = new JSON2CSVParser({ fields });
    const outputCsv = json2csvParser.parse(results);

    // --- Post-process the CSV header ---
    // Replace "day1", "day2", etc. in the header row with the actual date strings.
    const csvLines = outputCsv.split("\n");
    if (csvLines.length > 0) {
      const headerColumns = csvLines[0].split(",");
      for (let i = 0; i < days.length; i++) {
        headerColumns[i + 1] = days[i];
      }
      csvLines[0] = headerColumns.join(",");
    }
    const finalCsv = csvLines.join("\n");
    // -------------------------------------

    return new Response(finalCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="daily_counts.csv"',
      },
    });
  } catch (error) {
    console.error("Bulk Markets API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}