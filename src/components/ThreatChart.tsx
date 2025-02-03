"use client";

import { useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from "recharts";
import { DownloadIcon, ImageIcon } from "lucide-react";

interface ThreatChartProps {
  data: Array<{ date: string; count: number }>;
  keyword?: string;
}

interface CustomizedLabelProps {
  x: number;
  y: number;
  value: string | number;
}

const CustomizedLabel = (props: CustomizedLabelProps) => {
  const { x, y, value } = props;
  return (
    <text x={x} y={y} dy={-10} fill="#000" fontSize={12} textAnchor="middle">
      {value}
    </text>
  );
};

const formatXAxis = (tickItem: string): string => {
  const date = new Date(tickItem);
  return `${date.getMonth() + 1}-${date.getDate()}`;
};

export default function ThreatChart({ data, keyword }: ThreatChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const exportToPng = (): void => {
    if (chartRef.current) {
      const svgElement = chartRef.current.querySelector("svg");
      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement("canvas");
        const rect = svgElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext("2d");

        // Fill canvas with white background
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const img = new Image();
        img.onload = () => {
          ctx?.drawImage(img, 0, 0);
          const pngFile = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.download = "threat_chart.png";
          downloadLink.href = pngFile;
          downloadLink.click();
        };
        // Create a data URL with proper encoding
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      }
    }
  };

  const exportToCsv = (): void => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Date,Count\n" +
      data.map((row) => `${row.date},${row.count}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "threat_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Deep and Dark Web Mentions {keyword ? `for "${keyword}"` : ""}
        </CardTitle>
        <CardDescription>Daily count over last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatXAxis} padding={{ left: 30, right: 30 }}>
                <Label value="Date" offset={-5} position="insideBottom" />
              </XAxis>
              <YAxis>
                <Label value="Count" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} />
              </YAxis>
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                label={(props) => <CustomizedLabel {...(props as CustomizedLabelProps)} />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex justify-end space-x-2">
          <Button variant="outline" onClick={exportToPng}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Export as PNG
          </Button>
          <Button variant="outline" onClick={exportToCsv}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            Export as CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}