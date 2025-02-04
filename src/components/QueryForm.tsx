"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";

export interface QueryFormProps {
  onSubmit: (data: { keyword: string }) => void;
  placeholder?: string;
}

export default function QueryForm({ onSubmit, placeholder }: QueryFormProps) {
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ keyword });
  };

  return (
    <form onSubmit={handleSubmit} className="flex space-x-2">
      <Input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={placeholder || "Enter keyword..."}
        className="flex-grow"
      />
      <Button type="submit" disabled={!keyword.trim()}>
        <SearchIcon className="mr-2 h-4 w-4" />
        Search
      </Button>
    </form>
  );
}