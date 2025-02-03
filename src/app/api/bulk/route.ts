// src/app/api/bulk/route.ts

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

  // Create an array for the previous 7 days.
  for (let i = 6; i >= 0; i--) {
    const temp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(temp.toISOString().split("T")[0]);
  }
  return days;
}

/**
 * Constructs the payload for your external threat API
 */
function buildDailyPayload(keyword: string, day: string) {
  return {
    page: 0,
    size: 0,
    highlight: { enabled: true },
    include_total: true,
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
 * Calls your external threat API for a given keyword and day.
 * Returns the count as a number.
 */
async function fetchDailyTotal(keyword: string, day: string): Promise<number> {
  const payload = buildDailyPayload(keyword, day);

  const apiResponse = await fetch(process.env.THREAT_API_URL as string, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.THREAT_API_KEY}`,
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
 * The POST handler for the bulk API endpoint.
 *
 * Expects a multipart/form-data POST with a file field named "file".
 * The CSV file should contain one keyword per row (in the first column).
 * Returns a CSV file as an attachment with daily counts for each keyword.
 */
export async function POST(request: Request) {
  try {
    // Parse the incoming multipart/form-data request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Read the CSV file as text.
    const csvText = await file.text();

    // Parse the CSV file using PapaParse.
    const { data: rows } = parseCSV(csvText, {
      header: false,
      skipEmptyLines: true,
    });

    // Extract keywords (assuming each row's first column is a keyword)
    const keywords: string[] = rows.map((row: any) => row[0]).filter(Boolean);
    if (keywords.length === 0) {
      return NextResponse.json({ error: "CSV is empty or invalid" }, { status: 400 });
    }

    // Get the last 7 days (excluding today)
    const days = getLast7DaysExcludingToday();
    const results: Array<Record<string, any>> = [];

    // For each keyword, fetch the daily threat counts.
    for (const keyword of keywords) {
      const rowData: Record<string, any> = { keyword };
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        try {
          const count = await fetchDailyTotal(keyword, day);
          rowData[`day${i + 1}`] = count;
        } catch (error) {
          console.error(`Error processing keyword "${keyword}" on ${day}:`, error);
          // On error, you can set the count to 0 or handle it as needed.
          rowData[`day${i + 1}`] = 0;
        }
        // Optional: Insert a delay if your API has strict rate limits.
        // await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      results.push(rowData);
    }

    // Convert the results to CSV.
    const fields = ["keyword", ...days.map((_, i) => `day${i + 1}`)];
    const json2csvParser = new JSON2CSVParser({ fields });
    const outputCsv = json2csvParser.parse(results);

    // Return the CSV as a downloadable file.
    return new Response(outputCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="daily_counts.csv"',
      },
    });
  } catch (error: any) {
    console.error("Bulk API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}