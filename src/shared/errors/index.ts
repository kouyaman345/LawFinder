export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidLawIdError extends DomainError {
  constructor(value: string) {
    super(`不正な法令IDです: ${value}`);
  }
}

export class InvalidLawTitleError extends DomainError {
  constructor(value: string) {
    super(`不正な法令名です: ${value}`);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource}が見つかりません: ${id}`);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = '認証が必要です') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'アクセス権限がありません') {
    super(message);
  }
}

export class XMLValidationError extends DomainError {
  constructor(filePath: string) {
    super(`XMLファイルが不正です: ${filePath}`);
  }
}

export class PipelineError extends DomainError {
  constructor(
    message: string,
    public readonly step: string,
    public readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ) {
    super(message);
  }
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, any>;
  statusCode: number;
}

export class ErrorHandler {
  static handle(error: Error): ErrorResponse {
    if (error instanceof ValidationError) {
      return {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
        statusCode: 400
      };
    }
    
    if (error instanceof NotFoundError) {
      return {
        code: 'NOT_FOUND',
        message: error.message,
        statusCode: 404
      };
    }
    
    if (error instanceof UnauthorizedError) {
      return {
        code: 'UNAUTHORIZED',
        message: error.message,
        statusCode: 401
      };
    }
    
    if (error instanceof ForbiddenError) {
      return {
        code: 'FORBIDDEN',
        message: error.message,
        statusCode: 403
      };
    }
    
    console.error('Unhandled error:', error);
    return {
      code: 'INTERNAL_ERROR',
      message: 'サーバーエラーが発生しました',
      statusCode: 500
    };
  }
}