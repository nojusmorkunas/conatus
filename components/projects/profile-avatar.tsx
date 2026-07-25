"use client";

import Image from "next/image";

export function ProfileAvatar({
  displayName,
  hasAvatar,
  avatarVersion,
}: {
  displayName: string;
  hasAvatar: boolean;
  avatarVersion: string;
}) {
  if (hasAvatar) {
    return (
      <Image
        src={`/api/account/avatar?v=${avatarVersion}`}
        alt=""
        width={28}
        height={28}
        unoptimized
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pink-500 text-xs font-medium text-white">
      {displayName.charAt(0).toUpperCase()}
    </span>
  );
}
