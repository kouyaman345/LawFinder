export declare abstract class DomainError extends Error {
    constructor(message: string);
}
export declare class InvalidLawIdError extends DomainError {
    constructor(value: string);
}
export declare class InvalidLawTitleError extends DomainError {
    constructor(value: string);
}
export declare class NotFoundError extends DomainError {
    constructor(resource: string, id: string);
}
export declare class ValidationError extends DomainError {
    readonly details?: Record<string, any> | undefined;
    constructor(message: string, details?: Record<string, any> | undefined);
}
export declare class UnauthorizedError extends DomainError {
    constructor(message?: string);
}
export declare class ForbiddenError extends DomainError {
    constructor(message?: string);
}
export declare class XMLValidationError extends DomainError {
    constructor(filePath: string);
}
export declare class PipelineError extends DomainError {
    readonly step: string;
    readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    constructor(message: string, step: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL');
}
export interface ErrorResponse {
    code: string;
    message: string;
    details?: Record<string, any>;
    statusCode: number;
}
export declare class ErrorHandler {
    static handle(error: Error): ErrorResponse;
}
//# sourceMappingURL=index.d.ts.map