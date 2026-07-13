export class MalformedBlockError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = 'MalformedBlockError';
  }
}

export class OversizeBlockError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = 'OversizeBlockError';
  }
}

export class MissingArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingArtifactError';
  }
}
