"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface AttractionData {
  title: string | null;
  description: string | null;
  address: string | null;
  opening_hours: string | null;
  price: string | null;
  rating: number | null;
  image_url: string | null;
  tips: string[];
}

export default function TestAttractionPage() {
  const [attraction, setAttraction] = useState("");
  const [destination, setDestination] = useState("");

  const mutation = useMutation({
    mutationFn: async (vars: { attraction: string; destination: string }) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/attraction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<AttractionData>;
    },
  });

  const canSearch = attraction.trim().length > 0 && destination.trim().length > 0;

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Attraction Test</h1>

      <div className="flex gap-3">
        <Input
          placeholder="Attraction (e.g. Eiffel Tower)"
          value={attraction}
          onChange={(e) => setAttraction(e.target.value)}
        />
        <Input
          placeholder="Destination (e.g. Paris)"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
        <Button
          onClick={() => mutation.mutate({ attraction, destination })}
          disabled={mutation.isPending || !canSearch}
        >
          {mutation.isPending ? "Loading…" : "Search"}
        </Button>
      </div>

      {mutation.isError && <p className="text-red-500 text-sm">{(mutation.error as Error).message}</p>}

      {mutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>{mutation.data.title}</CardTitle>
            {mutation.data.rating != null && <CardDescription>Rating: {mutation.data.rating} / 5</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {mutation.data.description && <p>{mutation.data.description}</p>}
            {mutation.data.address && (
              <p>
                <span className="font-medium">Address:</span> {mutation.data.address}
              </p>
            )}
            {mutation.data.opening_hours && (
              <p>
                <span className="font-medium">Hours:</span> {mutation.data.opening_hours}
              </p>
            )}
            {mutation.data.price && (
              <p>
                <span className="font-medium">Price:</span> {mutation.data.price}
              </p>
            )}
            {mutation.data.tips?.length > 0 && (
              <div>
                <p className="font-medium mb-1">Tips:</p>
                <ul className="list-disc list-inside space-y-1">
                  {mutation.data.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
