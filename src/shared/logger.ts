export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, errOrContext?: LogContext | Error, maybeContext?: LogContext): void;
  child(scope: LogContext): Logger;
  setLevel(level: LogLevel): void;
}

function resolveInitialLevel(): LogLevel {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    const raw = env?.LOG_LEVEL?.toLowerCase();
    if (raw && raw in LEVEL_ORDER) return raw as LogLevel;
  } catch {
    // ignore — renderer contexts without a process global
  }
  return "info";
}

class ConsoleLogger implements Logger {
  private level: LogLevel;
  private readonly scope: LogContext;

  constructor(level: LogLevel, scope: LogContext = {}) {
    this.level = level;
    this.scope = scope;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private format(level: LogLevel, message: string, context?: LogContext): unknown[] {
    const merged = { ...this.scope, ...context };
    const prefix = `[${level}]`;
    return Object.keys(merged).length > 0 ? [prefix, message, merged] : [prefix, message];
  }

  debug(message: string, context?: LogContext) {
    if (this.shouldLog("debug")) console.debug(...this.format("debug", message, context));
  }

  info(message: string, context?: LogContext) {
    if (this.shouldLog("info")) console.info(...this.format("info", message, context));
  }

  warn(message: string, context?: LogContext) {
    if (this.shouldLog("warn")) console.warn(...this.format("warn", message, context));
  }

  error(message: string, errOrContext?: LogContext | Error, maybeContext?: LogContext) {
    if (!this.shouldLog("error")) return;
    let context: LogContext | undefined;
    if (errOrContext instanceof Error) {
      context = { ...maybeContext, error: errOrContext.message, stack: errOrContext.stack };
    } else {
      context = errOrContext;
    }
    console.error(...this.format("error", message, context));
  }

  child(scope: LogContext): Logger {
    return new ConsoleLogger(this.level, { ...this.scope, ...scope });
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }
}

export const logger: Logger = new ConsoleLogger(resolveInitialLevel());
