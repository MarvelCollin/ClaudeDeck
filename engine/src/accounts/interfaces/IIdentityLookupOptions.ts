export interface IIdentityLookupOptions {
  codeAccountPath?: string;
  lookup?: (accountUuid: string) => { email?: string; name?: string } | null;
}
