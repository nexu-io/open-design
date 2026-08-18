export class GroundedPptxHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class GroundedPptxClientInputError extends GroundedPptxHttpError {
  constructor(message: string) { super(message, 400); }
}
export class GroundedPptxNotFoundError extends GroundedPptxHttpError {
  constructor(message: string) { super(message, 404); }
}
export class GroundedPptxConflictError extends GroundedPptxHttpError {
  constructor(message: string) { super(message, 409); }
}
export class GroundedPptxPayloadTooLargeError extends GroundedPptxHttpError {
  constructor(message: string) { super(message, 413); }
}
export class GroundedPptxOverloadError extends GroundedPptxHttpError {
  constructor(message = 'grounded PPTX service is overloaded') { super(message, 429); }
}
export class GroundedPptxStorageCapacityError extends GroundedPptxHttpError {
  constructor(message: string) { super(message, 507); }
}
