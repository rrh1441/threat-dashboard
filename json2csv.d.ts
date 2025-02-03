// json2csv.d.ts

declare module "json2csv" {
    export interface ParserOptions<T = any> {
      fields?: (keyof T | string)[];
      delimiter?: string;
      quote?: string;
      withBOM?: boolean;
      header?: boolean;
      unwind?: string | string[];
      flatten?: boolean;
      flattenSeparator?: string;
      eol?: string;
    }
  
    export class Parser<T = any> {
      constructor(opts?: ParserOptions<T>);
      parse(data: T[]): string;
    }
  }