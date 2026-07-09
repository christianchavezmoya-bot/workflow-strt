import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    syncMeta?: {
      source?: string;
      opType?: string;
      payloadBytes?: number;
    };
  }
}
