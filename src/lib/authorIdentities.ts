export interface AuthorIdentity {
  id: string;
  name: string;
  email: string;
}

const AUTHOR_IDENTITIES_KEY = "thicket:authorIdentities";
const ACTIVE_AUTHOR_ID_KEY = "thicket:activeAuthorIdentityId";

function isValidIdentity(value: unknown): value is AuthorIdentity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.email === "string" &&
    v.name.trim().length > 0 &&
    v.email.trim().length > 0
  );
}

export function getAuthorIdentities(): AuthorIdentity[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTHOR_IDENTITIES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidIdentity);
  } catch {
    return [];
  }
}

export function saveAuthorIdentities(identities: AuthorIdentity[]) {
  localStorage.setItem(AUTHOR_IDENTITIES_KEY, JSON.stringify(identities));
}

export function getActiveAuthorIdentityId(): string | null {
  const value = localStorage.getItem(ACTIVE_AUTHOR_ID_KEY);
  return value && value.trim().length > 0 ? value : null;
}

export function setActiveAuthorIdentityId(id: string | null) {
  if (id && id.trim().length > 0) {
    localStorage.setItem(ACTIVE_AUTHOR_ID_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_AUTHOR_ID_KEY);
  }
}

export function makeAuthorIdentity(name: string, email: string): AuthorIdentity {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim(),
    email: email.trim(),
  };
}
