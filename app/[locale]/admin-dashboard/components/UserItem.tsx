"use client";

interface User {
  user_id: string;
  username: string;
  message_count: number;
  last_sign_in_at: string;
  email: string;
}

interface UsersItemProps {
  user: User;
}

function formatTimestamp(timestamp: string): string {
  // Create a Date object from the timestamp
  const date = new Date(timestamp);

  // Define options with correct values for DateTimeFormatOptions
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short", // Short format for month (e.g., "Oct")
    day: "2-digit", // Two-digit day
    hour: "2-digit", // Two-digit hour
    minute: "2-digit", // Two-digit minute
    hour12: false, // Use 24-hour format
  };

  // Return the formatted date string, removing the extra comma
  return date.toLocaleString(undefined, options).replace(",", "");
}

// Example usage

const UserItem = ({ user }: UsersItemProps) => {
  const { email, message_count, last_sign_in_at } = user;

  const maskEmail = (email: string) => {
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return email;
    return `${localPart[0]}${"x".repeat(localPart.length - 1)}@${domain}`;
  };

  return (
    <div className="border-table grid grid-cols-[2fr_1fr_3fr] items-center gap-6 border-b px-6 py-3 last:border-b-0">
      <div className="truncate text-sm">{maskEmail(email)}</div>
      <div className="text-sm">{message_count}</div>
      <div className="text-sm">{formatTimestamp(last_sign_in_at)}</div>
    </div>
  );
};

export default UserItem;
