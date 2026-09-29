const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type AvatarStorageClient = {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: unknown }>;
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ data: unknown; error: unknown }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export function validateAvatarFile(file: File) {
  const extension = AVATAR_TYPES[file.type];

  if (!extension) {
    return { ok: false as const, error: "invalid_type" };
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return { ok: false as const, error: "invalid_size" };
  }

  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  const validExtensions = extension === "jpg" ? ["jpg", "jpeg"] : [extension];
  if (!nameExtension || !validExtensions.includes(nameExtension)) {
    return { ok: false as const, error: "invalid_extension" };
  }

  return {
    ok: true as const,
    extension,
    contentType: file.type,
  };
}

export function avatarPathForUser(userId: string, extension: string) {
  return `${userId}/avatar.${extension}`;
}

/** Todas las rutas posibles del avatar de un usuario (una por extensión admitida). */
export function avatarPathsForUser(userId: string) {
  return ["jpg", "png", "webp"].map((extension) => avatarPathForUser(userId, extension));
}

/** Borra el avatar subido de un usuario. Devuelve false si Storage rechaza la operación. */
export async function removeUserAvatars(supabase: AvatarStorageClient, userId: string) {
  const { error } = await supabase.storage.from("avatars").remove(avatarPathsForUser(userId));
  return !error;
}

export async function uploadUserAvatar(supabase: AvatarStorageClient, userId: string, file: File) {
  const validated = validateAvatarFile(file);
  if (!validated.ok) return { ok: false as const, error: validated.error };

  const bucket = supabase.storage.from("avatars");
  await bucket.remove(avatarPathsForUser(userId));

  const path = avatarPathForUser(userId, validated.extension);
  const { error } = await bucket.upload(path, file, {
    contentType: validated.contentType,
    upsert: true,
  });

  if (error) return { ok: false as const, error: "upload_failed" };

  return {
    ok: true as const,
    path,
    publicUrl: bucket.getPublicUrl(path).data.publicUrl,
  };
}
