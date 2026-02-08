export interface ExtensionState {
  label: string;
}

export interface EchoInput {
  message: string;
  uppercase?: boolean;
}

export type ParsedCommand =
  | { action: "help" }
  | { action: "status" }
  | { action: "set-label"; value: string };
