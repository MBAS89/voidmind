"""
VoidMind SDK — Error Classes
"""


class VoidMindError(Exception):
    """Base error for all VoidMind SDK errors."""

    def __init__(self, message, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class AuthenticationError(VoidMindError):
    """Invalid API key or admin credentials."""

    def __init__(self, message, response_body=None):
        super().__init__(message, 401, response_body)


class RateLimitError(VoidMindError):
    """Rate limit exceeded."""

    def __init__(self, message, response_body=None, retry_after=None):
        super().__init__(message, 429, response_body)
        self.retry_after = retry_after


class ValidationError(VoidMindError):
    """Invalid request parameters."""

    def __init__(self, message, response_body=None):
        super().__init__(message, 400, response_body)


class ServerError(VoidMindError):
    """Server-side error."""

    def __init__(self, message, response_body=None):
        super().__init__(message, 500, response_body)


class CircuitBreakerError(VoidMindError):
    """Ollama is temporarily unavailable (circuit breaker open)."""

    def __init__(self, message, response_body=None):
        super().__init__(message, 503, response_body)
