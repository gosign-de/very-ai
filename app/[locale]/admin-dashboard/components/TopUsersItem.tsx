"use client";

interface TopUser {
  user_id: string;
  username: string;
  message_count: number;
  email: string;
}

interface TopUsersItemProps {
  activity: TopUser;
}

const TopUsersItem = ({ activity }: TopUsersItemProps) => {
  const { username, message_count } = activity;

  const maskUsername = (username: string) => {
    if (!username) return "";

    const length = username.length;
    if (length <= 5) return "x".repeat(length);

    return `${username.slice(0, length - 5)}${"x".repeat(5)}`;
  };

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-gray-700/40 py-2 first:border-t">
      <div className="text-left font-medium">{maskUsername(username)}</div>
      <div className="text-right">{message_count?.toLocaleString() || 0}</div>
    </li>
  );
};

export default TopUsersItem;
