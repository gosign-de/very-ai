import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getMediaTypeFromDataURL(dataURL: string): string | null {
  const matches = dataURL.match(/^data:([A-Za-z-+\/]+);base64/);
  return matches ? matches[1] : null;
}

export async function getBase64FromDataURL(dataURL: string) {
  const response = await fetch(dataURL);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}
