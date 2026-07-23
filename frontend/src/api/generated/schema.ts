export interface components {
  schemas: {
    User: {
      id: number;
      email: string;
      name: string;
      is_active: boolean;
      is_mfa_enabled: boolean;
    };
    LoginRequest: {
      email: string;
      password: string;
    };
    LoginResponse: {
      access: string;
      refresh: string;
      requires_mfa?: boolean;
      mfa_session?: string;
    };
    MFARequest: {
      mfa_session: string;
      code: string;
    };
    ProblemDetail: {
      type: string;
      title: string;
      status: number;
      detail: string;
      code?: string;
      errors?: Record<string, string[]>;
      correlationId?: string;
    };
  };
}

export type paths = {
  '/api/v1/auth/login/': {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['LoginRequest'] } };
      responses: {
        200: { content: { 'application/json': components['schemas']['LoginResponse'] } };
        422: { content: { 'application/json': components['schemas']['ProblemDetail'] } };
      };
    };
  };
  '/api/v1/auth/mfa/': {
    post: {
      requestBody: { content: { 'application/json': components['schemas']['MFARequest'] } };
      responses: {
        200: { content: { 'application/json': components['schemas']['LoginResponse'] } };
      };
    };
  };
  '/api/v1/auth/me/': {
    get: {
      responses: {
        200: { content: { 'application/json': components['schemas']['User'] } };
        401: { content: { 'application/json': components['schemas']['ProblemDetail'] } };
      };
    };
  };
  '/api/v1/auth/logout/': {
    post: {
      responses: { 200: { content: { 'application/json': { detail: string } } } };
    };
  };
  '/api/v1/auth/csrf/': {
    get: {
      responses: { 200: { content: { 'application/json': { detail: string } } } };
    };
  };
};
