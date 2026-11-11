// Shared by the server loader and the bell in the browser; no server imports here.

export interface Notice {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function toNotice(row: {
  id: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}): Notice {
  return {
    id: row.id,
    message: row.message,
    link: row.link,
    read: !!row.read_at,
    createdAt: row.created_at,
  };
}
