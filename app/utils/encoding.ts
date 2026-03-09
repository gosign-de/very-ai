export function encodeString(data: string): string {
  return Buffer.from(data).toString("base64");
}

export function decodedString(data: string): string {
  return Buffer.from(data, "base64").toString("utf-8");
}
