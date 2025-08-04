"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.PipelineError = exports.XMLValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.NotFoundError = exports.InvalidLawTitleError = exports.InvalidLawIdError = exports.DomainError = void 0;
class DomainError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.DomainError = DomainError;
class InvalidLawIdError extends DomainError {
    constructor(value) {
        super(`不正な法令IDです: ${value}`);
    }
}
exports.InvalidLawIdError = InvalidLawIdError;
class InvalidLawTitleError extends DomainError {
    constructor(value) {
        super(`不正な法令名です: ${value}`);
    }
}
exports.InvalidLawTitleError = InvalidLawTitleError;
class NotFoundError extends DomainError {
    constructor(resource, id) {
        super(`${resource}が見つかりません: ${id}`);
    }
}
exports.NotFoundError = NotFoundError;
class ValidationError extends DomainError {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends DomainError {
    constructor(message = '認証が必要です') {
        super(message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends DomainError {
    constructor(message = 'アクセス権限がありません') {
        super(message);
    }
}
exports.ForbiddenError = ForbiddenError;
class XMLValidationError extends DomainError {
    constructor(filePath) {
        super(`XMLファイルが不正です: ${filePath}`);
    }
}
exports.XMLValidationError = XMLValidationError;
class PipelineError extends DomainError {
    step;
    severity;
    constructor(message, step, severity) {
        super(message);
        this.step = step;
        this.severity = severity;
    }
}
exports.PipelineError = PipelineError;
class ErrorHandler {
    static handle(error) {
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
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=index.js.map