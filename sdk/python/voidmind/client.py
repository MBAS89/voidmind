"""
VoidMind SDK — Python Client
Official client for the VoidMind Zero-Knowledge AI Gateway.
"""

import json
import time
from typing import List, Dict, Any, Optional, Generator

import requests

from .errors import (
    VoidMindError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    ServerError,
    CircuitBreakerError,
)


class VoidMindClient:
    """
    Client for the VoidMind AI Gateway.

    Usage:
        client = VoidMindClient(base_url="https://...", api_key="vm_...")
        response = client.chat(messages=[{"role": "user", "content": "Hello"}])
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        max_retries: int = 2,
    ):
        if not base_url:
            raise ValueError("base_url is required")
        if not api_key:
            raise ValueError("api_key is required")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        """Close the underlying HTTP session."""
        self._session.close()

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "qwen2.5:3b",
        session_id: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> Dict[str, Any]:
        """
        Send a chat completion request.

        Args:
            messages: List of {"role": "system|user|assistant", "content": "..."}
            model: Model name (default: qwen2.5:3b)
            session_id: Existing session ID for continuity
            temperature: Sampling temperature (0-2)
            max_tokens: Max tokens to generate

        Returns:
            Chat completion response dict
        """
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if session_id:
            body["session_id"] = session_id

        return self._request("POST", "/api/v1/chat/completions", body)

    def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: str = "qwen2.5:3b",
        session_id: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream a chat completion.

        Yields chunk objects in OpenAI-compatible format.
        """
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if session_id:
            body["session_id"] = session_id

        url = f"{self.base_url}/api/v1/chat/completions"
        response = self._session.post(
            url,
            json=body,
            stream=True,
            timeout=self.timeout,
        )

        if response.status_code != 200:
            self._handle_error(response)

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                continue

    def end_session(self, session_id: str) -> Dict[str, Any]:
        """Explicitly end and wipe a session."""
        return self._request("POST", "/api/v1/session/end", {"session_id": session_id})

    def list_models(self) -> Dict[str, Any]:
        """List available Ollama models."""
        return self._request("GET", "/api/v1/models")

    def get_usage(self) -> Dict[str, Any]:
        """Get token usage for the current API key."""
        return self._request("GET", "/api/v1/usage")

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                if method == "GET":
                    response = self._session.get(url, timeout=self.timeout)
                elif method == "POST":
                    response = self._session.post(url, json=body, timeout=self.timeout)
                elif method == "DELETE":
                    response = self._session.delete(url, timeout=self.timeout)
                elif method == "PATCH":
                    response = self._session.patch(url, json=body, timeout=self.timeout)
                else:
                    raise ValueError(f"Unsupported method: {method}")

                if 200 <= response.status_code < 300:
                    return response.json()

                self._handle_error(response)

            except (requests.RequestException, VoidMindError) as e:
                last_error = e
                if isinstance(e, VoidMindError) and e.status_code in (429, 503):
                    time.sleep(2 ** attempt)
                    continue
                if isinstance(e, VoidMindError) and 400 <= e.status_code < 500:
                    raise
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise

        raise last_error or VoidMindError("Request failed")

    def _handle_error(self, response: requests.Response):
        try:
            body = response.json()
        except json.JSONDecodeError:
            body = {"message": response.text}

        message = body.get("message") or body.get("error") or f"HTTP {response.status_code}"
        retry_after = response.headers.get("Retry-After")

        if response.status_code == 401:
            raise AuthenticationError(message, body)
        elif response.status_code == 429:
            raise RateLimitError(message, body, retry_after)
        elif response.status_code == 400:
            raise ValidationError(message, body)
        elif response.status_code == 503:
            raise CircuitBreakerError(message, body)
        elif response.status_code >= 500:
            raise ServerError(message, body)
        else:
            raise VoidMindError(message, response.status_code, body)


class VoidMindAdminClient:
    """
    Admin client for VoidMind dashboard operations.

    Usage:
        admin = VoidMindAdminClient(base_url="https://...", access_token="eyJ...")
        keys = admin.list_keys()
    """

    def __init__(self, base_url: str, access_token: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        })

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        self._session.close()

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and return tokens."""
        return self._request("POST", "/admin/auth/login", {"email": email, "password": password})

    def list_keys(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/keys")

    def create_key(self, **kwargs) -> Dict[str, Any]:
        return self._request("POST", "/admin/keys", kwargs)

    def revoke_key(self, key_id: str) -> Dict[str, Any]:
        return self._request("DELETE", f"/admin/keys/{key_id}")

    def rotate_key(self, key_id: str) -> Dict[str, Any]:
        return self._request("POST", f"/admin/keys/{key_id}/rotate")

    def update_key_limits(self, key_id: str, **limits) -> Dict[str, Any]:
        return self._request("PATCH", f"/admin/keys/{key_id}/limits", limits)

    def get_usage(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/usage")

    def get_key_usage(self, key_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/admin/usage/{key_id}")

    def get_sessions(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/sessions")

    def wipe_all_sessions(self) -> Dict[str, Any]:
        return self._request("DELETE", "/admin/sessions")

    def get_health(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/health")

    def get_performance(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/performance")

    def get_compliance(self) -> Dict[str, Any]:
        return self._request("GET", "/admin/compliance")

    def clear_response_cache(self) -> Dict[str, Any]:
        return self._request("DELETE", "/admin/cache/response")

    def clear_prompt_cache(self) -> Dict[str, Any]:
        return self._request("DELETE", "/admin/cache/prompt")

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"

        if method == "GET":
            response = self._session.get(url, timeout=self.timeout)
        elif method == "POST":
            response = self._session.post(url, json=body, timeout=self.timeout)
        elif method == "DELETE":
            response = self._session.delete(url, timeout=self.timeout)
        elif method == "PATCH":
            response = self._session.patch(url, json=body, timeout=self.timeout)
        else:
            raise ValueError(f"Unsupported method: {method}")

        if 200 <= response.status_code < 300:
            return response.json()

        try:
            error_body = response.json()
        except json.JSONDecodeError:
            error_body = {"message": response.text}

        raise VoidMindError(
            error_body.get("message") or f"HTTP {response.status_code}",
            response.status_code,
            error_body,
        )
