export type Command = {
  description: string;
  run: () => Promise<void> | void;
};
