export interface ITaskActions {
  execute(choice: string | undefined): Promise<void>;
  install(): void;
  reloadContext(): void;
  runBackground(): void;
  stopBackground(): void;
  syncInstalledTask(): void;
}
