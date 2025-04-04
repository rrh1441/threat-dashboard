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
  now.setDate(now.getDate() - 1);

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
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.THREAT_API_KEY}`,
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
      // For each day, fetch the threat count and delay 250ms after each query
      // Use the actual day string as the key so that it matches the header
      for (const day of days) {
        try {
          const count = await fetchDailyTotal(keyword, day);
          rowData[day] = count;
        } catch (error) {
          console.error(`Error processing keyword "${keyword}" on ${day}:`, error);
          rowData[day] = 0;
        }
        // 250ms delay to avoid rate limiting (adjust if necessary)
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      results.push(rowData);
    }

    // Build header fields using the actual dates
    const fields = ["keyword", ...days];
    const json2csvParser = new JSON2CSVParser({ fields });
    const outputCsv = json2csvParser.parse(results);

    return new Response(outputCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="daily_counts.csv"',
      },
    });
  } catch (error) {
    console.error("Bulk API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}