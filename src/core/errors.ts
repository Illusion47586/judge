interface JudgeErrorOptions {
  cause?: unknown;
  code?: string;
}

export class JudgeError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: JudgeErrorOptions) {
    super(
      message,
      options && "cause" in options ? { cause: options.cause } : undefined
    );
    this.name = new.target.name;
    this.code = options?.code ?? code;
  }
}

export class ConfigurationError extends JudgeError {
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "configuration_error", options);
  }
}

export class SerializationError extends JudgeError {
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "serialization_error", options);
  }
}

export class ProviderError extends JudgeError {
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "provider_error", options);
  }
}

export class ProviderContractError extends JudgeError {
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "provider_contract_error", options);
  }
}

export class AbortError extends JudgeError {
  constructor(
    message = "The Judge evaluation was aborted.",
    options?: JudgeErrorOptions
  ) {
    super(message, "abort_error", options);
  }
}
