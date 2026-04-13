import { useState } from "react";

export interface LocalDestination {
  country: string;
  city: string;
  dayNumbers: number[];
}

export interface DayOption {
  label: string;
  value: number;
}

export function computeAvailableDays(dateFrom: string, dateTo: string): DayOption[] {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const days: DayOption[] = [];
  const current = new Date(start);
  let dayNumber = 1;

  while (current <= end) {
    const label = `Day ${dayNumber} (${current.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})`;
    days.push({ label, value: dayNumber });
    current.setDate(current.getDate() + 1);
    dayNumber++;
  }

  return days;
}

function parseDayInput(input: string): number[] {
  return input
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

export interface UseDestinationsReturn {
  destinations: LocalDestination[];
  country: string;
  city: string;
  checkedDays: number[];
  toggleDay: (dayValue: number) => void;
  dayInput: string;
  addError: string;
  handleFieldChange: (field: "country" | "city" | "dayInput", value: string) => void;
  addDestination: (dateFrom: string, dateTo: string) => boolean;
  removeDestination: (index: number) => void;
}

export function useDestinations(): UseDestinationsReturn {
  const [destinations, setDestinations] = useState<LocalDestination[]>([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  // checkedDays: used when date range is available (checkbox-based)
  const [checkedDays, setCheckedDays] = useState<number[]>([]);
  // dayInput: used when no date range (free text, comma-separated)
  const [dayInput, setDayInput] = useState("");
  const [addError, setAddError] = useState("");

  function handleFieldChange(field: "country" | "city" | "dayInput", value: string) {
    if (field === "country") setCountry(value);
    else if (field === "city") setCity(value);
    else setDayInput(value);
  }

  function toggleDay(dayValue: number) {
    setCheckedDays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue],
    );
  }

  function addDestination(dateFrom: string, dateTo: string): boolean {
    if (!country.trim() || !city.trim()) {
      setAddError("Country and city are required.");
      return false;
    }
    setAddError("");

    const hasDates = !!(dateFrom && dateTo && computeAvailableDays(dateFrom, dateTo).length > 0);
    const dayNumbers = hasDates ? [...checkedDays].sort((a, b) => a - b) : parseDayInput(dayInput);

    setDestinations((prev) => [
      ...prev,
      { country: country.trim(), city: city.trim(), dayNumbers },
    ]);
    setCountry("");
    setCity("");
    setCheckedDays([]);
    setDayInput("");
    return true;
  }

  function removeDestination(index: number) {
    setDestinations((prev) => prev.filter((_, i) => i !== index));
  }

  return {
    destinations,
    country,
    city,
    checkedDays,
    toggleDay,
    dayInput,
    addError,
    handleFieldChange,
    addDestination,
    removeDestination,
  };
}
