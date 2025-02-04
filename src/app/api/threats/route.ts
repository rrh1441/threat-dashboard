import { NextResponse } from "next/server";

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

async function fetchDailyTotal(keyword: string, day: string): Promise<number> {
  const payload = buildDailyPayload(keyword, day);

  const apiResponse = await fetch(process.env.THREAT_API_URL as string, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.THREAT_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`Day ${day} => ${apiResponse.status}: ${errorText}`);
  }

  const data = await apiResponse.json();
  return data?.total?.value ?? 0;
}

export async function POST(req: Request) {
  try {
    const { keyword } = (await req.json()) || {};
    if (!keyword) {
      return NextResponse.json({ error: "Missing 'keyword'" }, { status: 400 });
    }

    const days = getLast7DaysExcludingToday();
    let partial = false;
    const dailyResults: Array<{
      day: string;
      total: { value: number; relation: string };
    }> = [];

    for (const day of days) {
      try {
        const count = await fetchDailyTotal(keyword, day);
        dailyResults.push({
          day,
          total: {
            value: count,
            relation: "=",
          },
        });
      } catch {
        partial = true;
        break;
      }

      // quarter-second delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return NextResponse.json({ partial, data: dailyResults }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}