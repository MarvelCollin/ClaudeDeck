export interface ICodeSlotDeps {
  codeEmail: () => string | null;
  credPath: string;
  slotFile: (alias: string) => string;
}
