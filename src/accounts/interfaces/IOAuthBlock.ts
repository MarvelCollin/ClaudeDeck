export interface IOAuthBlock {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  [key: string]: unknown;
}
