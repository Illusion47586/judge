interface JudgeErrorOptions {
  cause?: unknown;
  code?: string;
}

/** Base class for stable Judge errors. */
export class JudgeError extends Error {
  /** A machine-readable error code that is stable across message changes. */
  readonly code: string;

  /**
   * Creates a Judge error.
   *
   * @param message - Human-readable details about the failure.
   * @param code - The default stable error code for this error type.
   * @param options - An optional underlying cause and code override.
   */
  constructor(message: string, code: string, options?: JudgeErrorOptions) {
    super(
      message,
      options && "cause" in options ? { cause: options.cause } : undefined
    );
    this.name = new.target.name;
    this.code = options?.code ?? code;
  }
}

/**
 * Reports invalid local configuration or request input.
 * @remarks The default stable code is `configuration_error`.
 */
export class ConfigurationError extends JudgeError {
  /**
   * Creates a configuration error whose default code is
   * `configuration_error`.
   *
   * @param message - Human-readable details about the invalid configuration.
   * @param options - An optional underlying cause and stable code override.
   */
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "configuration_error", options);
  }
}

/**
 * Reports context that cannot be represented as JSON.
 * @remarks The default stable code is `serialization_error`.
 */
export class SerializationError extends JudgeError {
  /**
   * Creates a serialization error whose default code is
   * `serialization_error`.
   *
   * @param message - Human-readable details about the unsupported value.
   * @param options - An optional underlying cause and stable code override.
   */
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "serialization_error", options);
  }
}

/**
 * Reports transport or upstream provider failure.
 * @remarks The default stable code is `provider_error`; adapters may use a
 * more specific code.
 */
export class ProviderError extends JudgeError {
  /**
   * Creates a provider error whose default code is `provider_error`.
   *
   * @remarks Adapters may supply a more specific stable code when the
   * upstream failure can be identified reliably.
   *
   * @param message - Human-readable details about the provider failure.
   * @param options - An optional upstream cause and stable code override.
   */
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "provider_error", options);
  }
}

/**
 * Reports an explicit provider context-window rejection.
 * @remarks Its stable code is always `context_limit`.
 */
export class ContextLimitError extends ProviderError {
  /**
   * Creates a context-limit error with the stable code `context_limit`.
   *
   * @param message - Human-readable provider rejection details.
   * @param options - An optional original provider error as the cause.
   */
  constructor(
    message = "The request exceeds the model context window.",
    options?: JudgeErrorOptions
  ) {
    super(message, { ...options, code: "context_limit" });
  }
}

/**
 * Reports malformed or impossible provider output.
 * @remarks The default stable code is `provider_contract_error`.
 */
export class ProviderContractError extends JudgeError {
  /**
   * Creates a provider-contract error whose default code is
   * `provider_contract_error`.
   *
   * @param message - Human-readable details about the contract violation.
   * @param options - An optional underlying cause and stable code override.
   */
  constructor(message: string, options?: JudgeErrorOptions) {
    super(message, "provider_contract_error", options);
  }
}

/**
 * Reports caller-requested cancellation.
 * @remarks The default stable code is `abort_error`.
 */
export class AbortError extends JudgeError {
  /**
   * Creates an abort error whose default code is `abort_error`.
   *
   * @param message - Human-readable cancellation details.
   * @param options - An optional underlying cause and stable code override.
   */
  constructor(
    message = "The Judge evaluation was aborted.",
    options?: JudgeErrorOptions
  ) {
    super(message, "abort_error", options);
  }
}
