export interface OpdsEntry {
  id: string;
  title: string;
  updated: string;
  author?: string;
  summary?: string;
  content?: string;
  links: OpdsLink[];
}

export interface OpdsLink {
  rel: string;
  href: string;
  type: string;
  title?: string;
}

export interface OpdsFeed {
  id: string;
  title: string;
  updated: string;
  author: {
    name: string;
    uri?: string;
  };
  links: OpdsLink[];
  entries: OpdsEntry[];
}

export interface OpdsSearchResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  entries: OpdsEntry[];
}

export interface OpdsBasicAuthCredentials {
  username: string;
  password: string;
}
