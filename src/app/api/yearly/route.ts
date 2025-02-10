import { NextResponse } from "next/server";
import { Parser as JSON2CSVParser } from "json2csv";

/**
 * Returns an array of the last 365 full days (excluding today)
 */
function getLast365DaysExcludingToday(): string[] {
  const days: string[] = [];
  const now = new Date();
  // Zero out time and exclude today.
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(day.toISOString().split("T")[0]);
  }
  return days.reverse();
}

/**
 * Constructs the payload for your API query.
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
 * Calls your API for a given keyword and day.
 * Returns the total count as a number.
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
 * The POST handler for the Yearly Search endpoint.
 *
 * Expects a JSON POST with a { keyword } body.
 * Iterates over the last 365 days, calls the API for each day,
 * and builds a CSV where the header row is replaced with the actual date strings.
 * A delay of 250ms is applied between API calls.
 */
export async function POST(req: Request) {
  try {
    const { keyword } = (await req.json()) || {};
    if (!keyword) {
      return NextResponse.json({ error: "Missing 'keyword'" }, { status: 400 });
    }

    const days = getLast365DaysExcludingToday();
    const resultRow: Record<string, number | string> = { keyword };

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      try {
        const count = await fetchDailyTotal(keyword, day);
        resultRow[`day${i + 1}`] = count;
      } catch (error) {
        console.error(`Error processing keyword "${keyword}" on ${day}:`, error);
        resultRow[`day${i + 1}`] = 0;
      }
      // 250ms delay to help avoid rate limiting (adjust as needed)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Build the CSV fields using internal keys.
    const fields = ["keyword", ...days.map((_, i) => `day${i + 1}`)];
    const json2csvParser = new JSON2CSVParser({ fields });
    const rawCsv = json2csvParser.parse([resultRow]);

    // Post-process header: replace "day1", "day2", etc. with the actual date strings.
    const csvLines = rawCsv.split("\n");
    if (csvLines.length > 0) {
      const headerColumns = csvLines[0].split(",");
      for (let i = 0; i < days.length; i++) {
        headerColumns[i + 1] = days[i];
      }
      csvLines[0] = headerColumns.join(",");
    }
    const finalCsv = csvLines.join("\n");

    return new Response(finalCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="yearly_counts.csv"',
      },
    });
  } catch (error) {
    console.error("Yearly API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}