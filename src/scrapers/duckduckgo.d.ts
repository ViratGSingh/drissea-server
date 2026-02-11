export interface DuckDuckGoResult {
  url: string;
  title: string;
  excerpts: string;
  ogImage: string;
}

export declare function duckDuckGoSearch(
  query: string,
  country: string
): Promise<DuckDuckGoResult[]>;

export declare function duckDuckGoBatchSearch(
  queries: string[],
  country: string
): Promise<DuckDuckGoResult[]>;
