import { useContext, useState, useEffect } from "react";
import { ChatbotUIContext } from "@/context/context";
import Image from "next/image";
import { IconUser } from "@tabler/icons-react";
function UserAvatar() {
  const { profile } = useContext(ChatbotUIContext);

  const [profileImageSrc, setProfileImageSrc] = useState(
    profile?.image_url || "",
  );

  useEffect(() => {
    if (profile?.image_url) {
      setProfileImageSrc(profile.image_url);
    }
  }, [profile?.image_url]);

  return (
    <div>
      {profileImageSrc ? (
        <Image
          src={profileImageSrc || ""}
          height={32}
          width={32}
          alt={"Profile Image"}
          className="rounded-full"
        />
      ) : (
        <IconUser
          height={32}
          width={32}
          className="border-input rounded border border-solid"
        />
      )}
    </div>
  );
}

export default UserAvatar;
