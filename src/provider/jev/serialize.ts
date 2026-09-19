import { SerializationError } from "../../core/errors.ts";

export const serializeState = (context: unknown): unknown => {
  try {
    const serialized = JSON.stringify(context);
    if (serialized === undefined) {
      throw new TypeError("Context has no JSON representation.");
    }
    return JSON.parse(serialized) as unknown;
  } catch (cause) {
    throw new SerializationError("Judge context could not be serialized.", {
      cause,
    });
  }
};
