"""
MongoDB MCP server integration for LangChain agents.

The MCP server runs as a subprocess (started by start.sh via npx).
This module provides a lazy-initialized toolkit of MCP tools that agents use
to query Atlas — find, aggregate (including $vectorSearch with auto-embedding).
"""
import os
from langchain_mcp_adapters.client import MultiServerMCPClient

_mcp_client: MultiServerMCPClient | None = None
_mcp_tools: list | None = None


async def get_mcp_tools() -> list:
    """Return LangChain-compatible tools from the MongoDB MCP server."""
    global _mcp_client, _mcp_tools
    if _mcp_tools is not None:
        return _mcp_tools

    atlas_uri = os.environ["ATLAS_URI"]
    _mcp_client = MultiServerMCPClient(
        {
            "mongodb": {
                "command": "npx",
                "args": ["-y", "mongodb-mcp-server"],
                "transport": "stdio",
                "env": {"MDB_MCP_CONNECTION_STRING": atlas_uri},
            }
        }
    )
    _mcp_tools = await _mcp_client.get_tools()
    return _mcp_tools


async def close_mcp():
    global _mcp_client, _mcp_tools
    if _mcp_client:
        await _mcp_client.__aexit__(None, None, None)
    _mcp_client = None
    _mcp_tools = None
