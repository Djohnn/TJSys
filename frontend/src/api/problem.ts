export interface ApiProblem {
  type: string
  title: string
  status: number
  detail: string
  code?: string
  errors?: Record<string, string[]>
  correlationId?: string
}

export class ApiProblemError extends Error {
  public readonly problem: ApiProblem

  constructor(problem: ApiProblem) {
    super(problem.detail || problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
  }
}

export class UnauthorizedError extends ApiProblemError {
  constructor(problem: ApiProblem) {
    super(problem)
    this.name = 'UnauthorizedError'
  }
}

export function isApiProblemError(error: unknown): error is ApiProblemError {
  return error instanceof ApiProblemError
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError
}
