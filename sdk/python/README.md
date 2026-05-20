# VoidMind Python SDK

Official Python client for the VoidMind Zero-Knowledge AI Gateway.

## Install

```bash
pip install voidmind
```

## Quick Start

```python
from voidmind import VoidMindClient

client = VoidMindClient(
    base_url="https://your-domain.com",
    api_key="vm_YOUR_API_KEY",
)

response = client.chat(
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
)

print(response["choices"][0]["message"]["content"])
client.close()
```

## Context Manager (Recommended)

```python
from voidmind import VoidMindClient

with VoidMindClient(base_url="...", api_key="...") as client:
    response = client.chat(messages=[...])
    print(response["choices"][0]["message"]["content"])
# Session auto-closed
```

## Streaming

```python
stream = client.stream_chat(messages=[{"role": "user", "content": "Tell me a story."}])

for chunk in stream:
    content = chunk["choices"][0]["delta"].get("content", "")
    print(content, end="", flush=True)
print()
```

## Session Management

```python
# First message
res1 = client.chat(messages=[...])
session_id = res1["session_id"]

# Continue conversation
res2 = client.chat(
    messages=[...],
    session_id=session_id,  # Reuse for context
)

# End session
client.end_session(session_id)
```

## Admin Operations

```python
from voidmind import VoidMindAdminClient

admin = VoidMindAdminClient(base_url="...", access_token="YOUR_JWT")

# Manage keys
keys = admin.list_keys()
new_key = admin.create_key(name="My App", daily_limit=2000)
admin.revoke_key(new_key["id"])

# Monitor
usage = admin.get_usage()
perf = admin.get_performance()
admin.wipe_all_sessions()
```

## Error Handling

```python
from voidmind import AuthenticationError, RateLimitError

try:
    client.chat(messages=[...])
except AuthenticationError:
    print("Invalid API key")
except RateLimitError as e:
    print(f"Rate limited. Retry after: {e.retry_after}")
except Exception as e:
    print(f"Error: {e}")
```

## Requirements

- Python 3.8+
- `requests` library (auto-installed)

## License

MIT
