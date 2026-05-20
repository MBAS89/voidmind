"""
VoidMind Python SDK — Basic Usage Example
"""

from voidmind import VoidMindClient

def main():
    client = VoidMindClient(
        base_url="http://localhost:3000",
        api_key="vm_YOUR_API_KEY_HERE",
    )

    # Simple chat
    response = client.chat(
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is the capital of France?"},
        ],
        max_tokens=256,
    )

    print("Response:", response["choices"][0]["message"]["content"])
    print("Tokens used:", response["usage"]["total_tokens"])
    print("Session ID:", response.get("session_id"))

    session_id = response["session_id"]

    # Continue the same session
    response2 = client.chat(
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is the capital of France?"},
            {"role": "assistant", "content": response["choices"][0]["message"]["content"]},
            {"role": "user", "content": "And what about Germany?"},
        ],
        session_id=session_id,
        max_tokens=256,
    )

    print("Follow-up:", response2["choices"][0]["message"]["content"])

    # End session
    client.end_session(session_id)
    print("Session ended.")

    client.close()


if __name__ == "__main__":
    main()
