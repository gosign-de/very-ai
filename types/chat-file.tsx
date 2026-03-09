export interface ChatFile {
  id: string;
  name: string;
  type: string;
  file: File | null;
  status?: "loading" | "uploaded" | "error";
  chatId?: string;
}
