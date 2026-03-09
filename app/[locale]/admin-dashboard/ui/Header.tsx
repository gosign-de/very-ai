import HeaderMenu from "./HeaderMenu";
import UserAvatar from "../components/UserAvatar";

function Header() {
  return (
    <header className="bg-red border-grey flex items-center justify-end gap-[8px] border-b px-[48px] py-[12px]">
      <UserAvatar />
      <HeaderMenu />
    </header>
  );
}

export default Header;
